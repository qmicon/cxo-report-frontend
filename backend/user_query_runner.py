import json
from neo4j import GraphDatabase
import openai
import re
from sqlalchemy import create_engine, MetaData, text

client = openai.OpenAI()
deepseek_client = openai.OpenAI(base_url="https://api.deepseek.com/v1", api_key="sk-f49970f9d15d43188556aa455f374404")

# Neo4j Connection Details
NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "test123123"

# Connect to Neo4j
neo4j_driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

# Function to generate embeddings using OpenAI
def get_openai_embeddings(texts):
    response  = client.embeddings.create(
    input=texts,
    model="text-embedding-3-small"
    )
    return [data.embedding for data in response.data]

# Step 3: Find Relevant Tables Using GDS Similarity
def find_relevant_tables_gds(query_embedding, database_name: str, top_k: int = 5):
    """Use Neo4j GDS to compute similarity between the query embedding and stored embeddings."""
    with neo4j_driver.session() as session:
        # Add query embedding as temporary node
        session.run(
            """
            MERGE (q:Query {id: 'query'})
            SET q.embedding = $embedding
            """,
            embedding=query_embedding,
        )

        # Compute similarity with database context
        result = session.run(
            """
            MATCH (q:Query {id: 'query'}), (t:Table)
            WHERE t.embedding IS NOT NULL 
            AND t.database = $database
            RETURN t.name AS table_name,
                   t.description AS description,
                   gds.similarity.cosine(q.embedding, t.embedding) AS similarity
            ORDER BY similarity DESC
            LIMIT $top_k
            """,
            database=database_name,
            top_k=top_k,
        )

        # Cleanup temporary node
        session.run("MATCH (q:Query {id: 'query'}) DETACH DELETE q")

        return [
            {
                "table_name": record["table_name"],
                "description": record["description"],
                "similarity": record["similarity"]
            } 
            for record in result
        ]

# Step 4: Expand Related Tables Recursively
def expand_related_tables_recursively(database_name: str, initial_tables: list[str], depth: int = 2):
    """Expand related tables with database context"""
    related_tables = set(initial_tables)
    with neo4j_driver.session() as session:
        for table in initial_tables:
            # Use ..depth syntax instead of $depth parameter
            query = f"""
            MATCH (t:Table {{name: $table, database: $database}})
                  -[:RELATES_TO*1..{depth}]-(related:Table)
            WHERE related.database = $database      
            RETURN DISTINCT related.name AS related_table
            """
            result = session.run(
                query,
                table=table,
                database=database_name
            )
            related_tables.update(record["related_table"] for record in result)
    return list(related_tables)

def parse_sql_from_response(response_text):
    """
    Parse the SQL query from the LLM response using regex.

    Parameters:
    - response_text (str): The response text from the LLM.

    Returns:
    - str: The parsed SQL query.

    Raises:
    - ValueError: If no valid SQL query is found in the response.
    """
    # Regex to match SQL block encapsulated in ```sql ... ```
    sql_block_pattern = r"```sql\s(.*?)```"
    match = re.search(sql_block_pattern, response_text, re.DOTALL)
    if match:
        return match.group(1).strip()
    
    # Fallback: Regex to find a valid SQL query starting with SELECT
    sql_start_pattern = r"(SELECT .*?;)"
    match = re.search(sql_start_pattern, response_text, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()

    # If no valid SQL is found, raise an error
    raise ValueError("No valid SQL query found in the LLM response.")

def generate_sql_query(messages, model="gpt-4o"):
    """
    Generate SQL query using OpenAI LLM with conversation history.
    """
    response = deepseek_client.chat.completions.create(
        model="deepseek-chat",
        messages=messages,
    )
    return response.choices[0].message.content.strip()

def execute_sql_query(sql_query, conversation_history, dbtype, engine):
    with engine.connect() as connection:
        try:
            result = connection.execute(text(sql_query))
            rows = result.fetchall()
            conversation_history.append({"role": "user", "content": f"SQL query execution result: {str(rows)[:100]}\nDoes the result accurately answer my question? Reply with 'yes' or 'no'."})
            yes_or_no = generate_sql_query(conversation_history, "gpt-4o-mini")
            print("yes_or_no", yes_or_no)
            if "no" in yes_or_no.lower():
                raise ValueError("User indicated that the query did not return the correct result.")
            return rows, sql_query
        except Exception as e:
            print(f"Error executing query: {e}")
            connection.rollback()
            db_type_str = "SQLite" if dbtype == "default" else "PostgreSQL"
            error_message = f"""
            The following SQL query failed with error: {str(e)}

            Please correct the SQL query to work with {db_type_str} database. Pay attention to date functions and syntax differences.
            Return only the corrected SQL query without any explanations.
            """
            conversation_history.append({"role": "user", "content": error_message})
            
            # Get corrected query from LLM
            corrected_query = generate_sql_query(conversation_history)
            corrected_sql = parse_sql_from_response(corrected_query)
            
            try:
                # Execute corrected query
                result = connection.execute(text(corrected_sql))
                return result.fetchall(), corrected_sql
            except Exception as e2:
                connection.rollback()
                print(f"Error executing query even after correction: {e2}\nOriginal error: {e}", "Error while executing query")
                error_message = f"""
                The following SQL query failed with error: {str(e2)}

                Please correct the SQL query to work with {db_type_str} database. Pay attention to date functions and syntax differences.
                Return only the corrected SQL query without any explanations.
                """
                conversation_history.append({"role": "user", "content": error_message})
                
                # Get corrected query from LLM
                corrected_query = generate_sql_query(conversation_history)
                corrected_sql = parse_sql_from_response(corrected_query)
                
                try:
                    # Execute corrected query
                    result = connection.execute(text(corrected_sql))
                    return result.fetchall(), corrected_sql
                except Exception as e3:
                    connection.rollback()
                    print(f"Error executing query even after correction: {e3}\nOriginal error: {e2}", "Error while executing query")
                    return str(e3), corrected_sql

def generate_sql_query_from_user_query(user_query, relevant_tables, metadata_tables, dbtype):
    """
    Generate an SQL query based on the user query in two steps:
    1. Analyze required columns
    2. Generate SQL query based on schema and required columns
    """
    # First LLM call to analyze required columns
    tables = metadata_tables
    column_analysis_prompt = f"""
    You are an expert data analyst. Based on the user's question, analyze and describe what columns are required in the output to precisely answer the user's question. Focus only on understanding the data needs from the question itself, without considering the database schema yet.

    User Question: {user_query}

    Required Output Analysis:
    """

    conversation_history = [{"role": "user", "content": column_analysis_prompt}]
    column_analysis = generate_sql_query(conversation_history, "gpt-4o-mini")
    print("column_analysis", column_analysis)
    # Prepare schema context (same as before)
    context = "Relevant Database Schema:\n\n"
    for table in relevant_tables:
        description = tables[table].description if tables[table].description else "No description available."
        context += f"Table Name: {table}\nDescription: {description}\n"
        columns = [f"{col.name} ({col.type})" for col in tables[table].columns]
        context += f"Columns: {', '.join(columns)}\n\n"

    # Add relationships (same as before)
    context += "Relationships Between Tables:\n"
    for table in relevant_tables:
        for fk in tables[table].foreign_keys:
            source = fk.parent.table.name
            target = fk.column.table.name
            if source in relevant_tables and target in relevant_tables:
                context += f"- {source} relates to {target} via {fk.parent.name} -> {fk.column.name}\n"

    # Second LLM call with database-specific instructions
    db_specific_instructions = "Use SQLite compatible syntax." if dbtype == "default" else "Use PostgreSQL syntax."
    
    sql_generation_prompt = f"""
    You are an expert SQL assistant who writes SQL queries for {dbtype} database type. {db_specific_instructions}

    Required Column Analysis:
    {column_analysis}

    {context}
    
    Next, based on the provided SQL database tables and their schema, write instructions for the plan on how you intend to write the SQL query to generate the required output columns, please add any more columns if required. Finally, write a valid SQL query to answer the question. Write only one SQL statement in your final answer. Make sure Table names are exact and case-sensitive and space-sensitive (Use colons to enclose space-separated table names).

    SQL Query:
    """

    conversation_history = [{"role": "user", "content": sql_generation_prompt}]
    llm_response = generate_sql_query(conversation_history, "gpt-4o-mini")
    return llm_response, conversation_history

def correct_table_names(sql_query, table_names):
    # Replace :TableName with "TableName" only for known table names
    for table_name in table_names:
        pattern = f":{re.escape(table_name)}"
        sql_query = sql_query.replace(pattern, f'"{table_name}"')
    return sql_query

def get_relevant_name_and_questions(user_query, sql_query):
    function_schemas = [
        {
            "name": "set_table_details",
            "description": "Set the frontend with table title, and related questions to get more insights.",
            "parameters": {
                "type": "object",
                "properties": {
                    "table_title": {
                        "type": "string",
                        "description": "The title of the table returned after executing the SQL query."
                    },
                    "related_questions": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Three related questions about the table that give more insights."
                    }
                },
                "required": ["table_title", "related_questions"]
            }
        }
    ]

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
        {
            "role": "user",
            "content": f"To answer this query: {user_query}\nBusiness analyst came up with this SQL query: {sql_query}\nWhat should be the title of the table generated by executing the SQL query? What are three related questions about the table generated after SQL execution that can be answered to provide more insight?"
        }
    ],
    functions=function_schemas,
    function_call={"name": "set_table_details"} 
    )
    # Parse the response
    function_call = response.choices[0].message.function_call
    arguments = json.loads(function_call.arguments)
    return arguments["table_title"], arguments["related_questions"]


def run_pipeline(user_query: str, database_name: str, dbtype: str = "default", engine=None, metadata=None, top_k: int = 5, expansion_depth: int = 2):
    """
    Run the complete query pipeline with database context
    """
    if not engine or not metadata:
        raise ValueError("Database configuration not provided")
        
    tables = metadata.tables
    # Generate embedding for the user query
    query_embedding = get_openai_embeddings([user_query])[0]

    # Find initial relevant tables with database context
    relevant_tables = find_relevant_tables_gds(query_embedding, database_name, top_k=top_k)
    initial_table_names = [table["table_name"] for table in relevant_tables]

    # Expand related tables with database context
    expanded_tables = expand_related_tables_recursively(database_name, initial_table_names, depth=expansion_depth)

    # Generate SQL query with database type
    llm_response, conversation_history = generate_sql_query_from_user_query(user_query, expanded_tables, tables, dbtype)
    conversation_history.append({"role": "assistant", "content": llm_response})
    
    # Parse and fix SQL query
    sql_query = parse_sql_from_response(llm_response)
    unbinded_sql_query = correct_table_names(sql_query, expanded_tables)

    # Execute the SQL query
    results, sql_query = execute_sql_query(unbinded_sql_query, conversation_history, dbtype, engine)
    table_name, relevant_questions = get_relevant_name_and_questions(user_query, sql_query)
    
    return results, sql_query, table_name, relevant_questions

# Step 6: Initialize and Run
if __name__ == "__main__":
    import sys
    from sqlalchemy import create_engine, MetaData

    # Get database type from command line argument or default to SQLite
    dbtype = sys.argv[1] if len(sys.argv) > 1 else "default"
    database_name = sys.argv[2] if len(sys.argv) > 2 else "test_db"

    # Set up database connection based on type
    if dbtype == "default":
        # SQLite connection
        engine = create_engine('sqlite:///test.db')
    else:
        # PostgreSQL connection
        engine = create_engine('postgresql://username:password@localhost:5432/test_db')

    # Create MetaData instance
    metadata = MetaData()
    metadata.reflect(bind=engine)

    try:
        # Get user query
        user_query = input("Enter your query: ")
        
        # Run the pipeline
        results, sql_query, table_name, relevant_questions = run_pipeline(
            user_query=user_query,
            database_name=database_name,
            dbtype=dbtype,
            engine=engine,
            metadata=metadata
        )

        # Print results
        print("\nResults:")
        print("Table:", table_name)
        print("\nSQL Query:")
        print(sql_query)
        print("\nData:")
        for row in results:
            print(row)
        print("\nRelated questions you might want to ask:")
        for i, question in enumerate(relevant_questions, 1):
            print(f"{i}. {question}")

    except Exception as e:
        print(f"Error: {str(e)}")
    finally:
        if engine:
            engine.dispose()