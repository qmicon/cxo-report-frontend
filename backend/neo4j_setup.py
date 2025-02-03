from neo4j import GraphDatabase
import openai
from sqlalchemy import create_engine, MetaData, text
import os

client = openai.OpenAI()

# Neo4j Connection Details
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "test123123")

# Connect to Neo4j
neo4j_driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

# Function to generate embeddings using OpenAI
def get_openai_embeddings(texts):
    response = client.embeddings.create(
        input=texts,
        model="text-embedding-ada-002"
    )
    return [data.embedding for data in response.data]

# Function to generate table descriptions using OpenAI
def generate_table_descriptions(engine, metadata):
    if not engine or not metadata:
        raise ValueError("Database configuration not initialized")
        
    descriptions = {}
    for table_name, table in metadata.tables.items():
        # Get primary key columns
        pk_columns = [key.name for key in table.primary_key]
        
        # Get foreign key relationships
        fk_relationships = []
        for fk in table.foreign_keys:
            fk_relationships.append(f"{fk.parent.name} -> {fk.column.table.name}.{fk.column.name}")
        
        # Get sample data for each column
        sample_data = {}
        try:
            with engine.connect() as connection:
                # Fetch one row with non-null and non-zero values
                query = f'SELECT * FROM "{table_name}" WHERE '
                conditions = []
                for col in table.columns:
                    col_name = col.name if col.name.isidentifier() else f'"{col.name}"'
                    col_type = str(col.type).lower()
                    if any(t in col_type for t in ('int', 'float', 'numeric', 'real', 'decimal')):
                        conditions.append(f"({col_name} IS NOT NULL AND {col_name} != 0)")
                    else:
                        conditions.append(f"{col_name} IS NOT NULL")
                query += " AND ".join(conditions) + " LIMIT 1"
                result = connection.execute(text(query))
                row = result.fetchone()
                if row:
                    sample_data = dict(row._mapping)
        except Exception as e:
            connection.rollback()
            print(f"Warning: Could not fetch sample data for {table_name}: {e}")

        # Prepare table schema details with example values
        columns = []
        for col in table.columns:
            col_name = col.name if col.name.isidentifier() else f'"{col.name}"'
            example_value = str(sample_data.get(col.name, 'N/A'))
            if len(example_value) > 50:
                example_value = example_value[:47] + "..."
            columns.append(f"{col_name} ({col.type}) - Example: {example_value}")

        schema_description = (
            f"Table {table_name}:\n"
            f"Primary Keys: {', '.join(pk_columns)}\n"
            f"Columns with examples:\n- " + "\n- ".join(columns) + "\n"
            f"Foreign Keys: {', '.join(fk_relationships)}"
        )
        
        # Use OpenAI to generate description
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a database schema documentation assistant. Include example values in your description when available."},
                {"role": "user", "content": f"Describe the following table schema concisely, mentioning the example values where relevant:\n{schema_description}"},
            ],
        )
        descriptions[table_name] = response.choices[0].message.content.strip()
    
    return descriptions

def get_table_descriptions_from_neo4j():
    """Retrieve existing table descriptions from Neo4j with exact name matching"""
    with neo4j_driver.session() as session:
        result = session.run("""
            MATCH (t:Table)
            WHERE t.description IS NOT NULL AND t.embedding IS NOT NULL
            RETURN t.database as database, t.name as name, t.description as description
        """)
        return {(record["database"], record["name"]): record["description"] for record in result}

def get_table_info_from_neo4j(database_name: str):
    """
    Get tables' information from Neo4j for a specific database.
    
    Args:
        database_name: str - The name of the database to query
        
    Returns:
        - dict: table info with validation status
        - bool: True if all required properties exist
    """
    with neo4j_driver.session() as session:
        # Get tables with all their properties
        result = session.run("""
            MATCH (t:Table)
            WHERE t.database = $database_name
            RETURN 
                t.database as database,
                t.name as name,
                t.description as description,
                t.embedding as embedding
        """, database_name=database_name)
        
        table_info = {}
        all_valid = True
        
        for record in result:
            name = record["name"]
            desc = record["description"]
            emb = record["embedding"]
            
            # Check if table has all required properties
            is_valid = all(x is not None for x in [name, desc, emb])
            all_valid = all_valid and is_valid
            
            table_info[name] = {
                "description": desc,
                "has_required_props": is_valid
            }
        
        return table_info, all_valid

# Step 1: Create Graph in Neo4j
def create_graph_in_neo4j(database_name, table_descriptions, metadata):
    """Create graph with exact table name matching for specific database"""
    tables = metadata.tables
    with neo4j_driver.session() as session:
        # Delete only nodes for specific database
        session.run("""
            MATCH (t:Table {database: $database_name})
            DETACH DELETE t
        """, database_name=database_name)

        # Create indices for better performance
        session.run("CREATE INDEX table_name IF NOT EXISTS FOR (t:Table) ON (t.name)")

        # Add tables as nodes with exact names
        for table_name, description in table_descriptions.items():
            session.run(
                """
                CREATE (t:Table {database: $database, name: $name, description: $description})
                WITH t
                MATCH (existing:Table {database: $database, name: $name})
                WHERE id(existing) <> id(t)
                DELETE existing
                """,
                database=database_name,
                name=table_name,
                description=description
            )

        # Add relationships with exact name matching
        for table_name, table in tables.items():
            for fk in table.foreign_keys:
                source = fk.parent.table.name
                target = fk.column.table.name
                session.run(
                    """
                    MATCH (a:Table {database: $database, name: $source})
                    MATCH (b:Table {database: $database, name: $target})
                    MERGE (a)-[:RELATES_TO]->(b)
                    """,
                    database=database_name,
                    source=source,
                    target=target
                )

def check_neo4j_setup(metadata, database_name):
    """Check if tables are already set up in Neo4j and match with current metadata"""
    current_tables = set(metadata.tables.keys())
    
    # Get table info from Neo4j
    neo4j_tables, all_valid = get_table_info_from_neo4j(database_name)
    
    # Check if:
    # 1. We have valid tables in Neo4j
    # 2. All current tables exist in Neo4j
    # 3. Table names match exactly
    tables_exist = len(neo4j_tables) > 0 and all_valid
    tables_match = current_tables.issubset(neo4j_tables.keys())
    
    # Extract just the descriptions for the response
    descriptions = {name: info["description"] 
                   for name, info in neo4j_tables.items()}
    
    return tables_exist and tables_match, descriptions

# Step 2: Store Table Embeddings
def store_table_embeddings(database_name, table_descriptions):
    with neo4j_driver.session() as session:
        for table_name, description in table_descriptions.items():
            # Generate embedding for table description
            embedding = get_openai_embeddings([description])[0]

            # Store embedding in Neo4j
            session.run(
                """
                MATCH (t:Table {database: $database, name: $table_name})
                SET t.embedding = $embedding
                """,
                database=database_name,
                table_name=table_name,
                embedding=embedding,
            )

# Step 6: Initialize and Run
if __name__ == "__main__":
    import sys
    from sqlalchemy import create_engine, MetaData
    
    # Get database type and name from command line or use defaults
    dbtype = sys.argv[1] if len(sys.argv) > 1 else "default"
    database_name = sys.argv[2] if len(sys.argv) > 2 else "test_db"

    # Set up database connection based on type
    if dbtype == "default":
        engine = create_engine('sqlite:///test.db')
    else:
        DB_USER = os.getenv("DB_USER", "postgres")
        DB_PASS = os.getenv("DB_PASS", "postgres")
        DB_HOST = os.getenv("DB_HOST", "localhost")
        DB_PORT = os.getenv("DB_PORT", "5432")
        engine = create_engine(f'postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{database_name}')

    try:
        # Initialize metadata
        metadata = MetaData()
        metadata.reflect(bind=engine)

        # Check if Neo4j setup is needed
        tables_ready, existing_descriptions = check_neo4j_setup(metadata, database_name)

        if not tables_ready:
            print("Generating new table descriptions...")
            table_descriptions = generate_table_descriptions(engine, metadata)
            print("Creating graph in Neo4j...")
            create_graph_in_neo4j(database_name, table_descriptions, metadata)
            print("Storing table embeddings...")
            store_table_embeddings(database_name, table_descriptions)
        else:
            print("Tables already set up in Neo4j with valid embeddings")

    except Exception as e:
        print(f"Error during Neo4j setup: {str(e)}")
    finally:
        if engine:
            engine.dispose()
        if neo4j_driver:
            neo4j_driver.close()