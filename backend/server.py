from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, List, Any
from urllib.parse import quote_plus
import os
import neo4j_setup
import user_query_runner
from sqlalchemy import create_engine, text, MetaData
import traceback
import hashlib

app = FastAPI()

# Get CORS origins from environment variable or use default
CORS_ORIGINS = os.environ.get('ALLOWED_ORIGINS', 'http://localhost:3000').split(',')

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PLATFORMS = [
    'Snowflake',
    'Amazon Redshift',
    'Google BigQuery',
    'Azure Synapse',
    'SAP HANA',
    'Databricks Delta Lake',
    'Starburst Trino',
    'Presto',
    'Oracle ADW',
    'Teradata Vantage',
    'Dremio'
]

class DBConfig(BaseModel):
    type: str
    platform: Optional[str] = None
    host: Optional[str] = None
    port: Optional[str] = None
    database: str
    username: Optional[str] = None
    password: Optional[str] = None

class QueryRequest(BaseModel):
    query: str
    dbConfig: DBConfig

def create_connection_string(config: DBConfig) -> str:
    if config.type == "default":
        return f"sqlite:///{config.database or 'northwind.db'}"
    elif config.type == "custom":
        username = quote_plus(config.username or '')
        password = quote_plus(config.password or '')
        
        if config.platform == 'Snowflake':
            return f"snowflake://{username}:{password}@{config.host}/{config.database}"
        elif config.platform == 'Amazon Redshift':
            return f"redshift+psycopg2://{username}:{password}@{config.host}:{config.port}/{config.database}"
        elif config.platform == 'Google BigQuery':
            return f"bigquery://{config.database}"  # Assumes credentials are handled via environment
        elif config.platform == 'Azure Synapse':
            return f"mssql+pyodbc://{username}:{password}@{config.host}:{config.port}/{config.database}?driver=ODBC+Driver+17+for+SQL+Server"
        elif config.platform == 'SAP HANA':
            return f"hana://{username}:{password}@{config.host}:{config.port}/{config.database}"
        elif config.platform == 'Databricks Delta Lake':
            return f"databricks://token:{password}@{config.host}/?http_path={config.database}"
        elif config.platform == 'Starburst Trino' or config.platform == 'Presto':
            return f"trino://{username}:{password}@{config.host}:{config.port}/{config.database}"
        elif config.platform == 'Oracle ADW':
            return f"oracle+cx_oracle://{username}:{password}@{config.host}:{config.port}/{config.database}"
        elif config.platform == 'Teradata Vantage':
            return f"teradatasql://{username}:{password}@{config.host}/{config.database}"
        elif config.platform == 'Dremio':
            return f"dremio://{username}:{password}@{config.host}:{config.port}/{config.database}"
        elif config.platform == 'PostgreSQL':
            return f"postgresql://{username}:{password}@{config.host}:{config.port}/{config.database}"
    else:
        raise ValueError(f"Unsupported database type: {config.type}")

def generate_database_name(config: DBConfig) -> str:
    connection_string = create_connection_string(config)
    return hashlib.sha256(connection_string.encode()).hexdigest()

@app.post("/api/configure-db")
async def configure_database(config: DBConfig):
    print(config)
    try:
        # Create connection string and initialize DB
        connection_string = create_connection_string(config)
        print(connection_string)
        db_engine = create_engine(connection_string)
        metadata = MetaData()
        
        # Test the connection
        with db_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        
        # Reflect database metadata
        metadata.reflect(bind=db_engine)
        
        # Generate a unique database name
        database_name = generate_database_name(config)

        # Check if Neo4j setup matches current metadata
        neo4j_matches, existing_descriptions = neo4j_setup.check_neo4j_setup(metadata, database_name)
        
        if not neo4j_matches:
            print("Running Neo4j setup - tables don't match...")
            table_descriptions = neo4j_setup.generate_table_descriptions(db_engine, metadata)
            neo4j_setup.create_graph_in_neo4j(database_name, table_descriptions, metadata)
            neo4j_setup.store_table_embeddings(database_name, table_descriptions)
        else:
            print("Using existing Neo4j setup - tables match...")
            table_descriptions = existing_descriptions

        return {
            "status": "success",
            "message": "Database configured successfully",
            "table_descriptions": table_descriptions,
            "neo4j_setup": "existing" if neo4j_matches else "new"
        }
    except Exception as e:
        traceback.print_exc()  # Print the full error for debugging
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to configure database: {str(e)}"
        )

@app.post("/api/run-query")
async def run_query(request: QueryRequest):
    try:
        # Create new engine and metadata for this request
        connection_string = create_connection_string(request.dbConfig)
        db_engine = create_engine(connection_string)
        metadata = MetaData()
        metadata.reflect(bind=db_engine)

        # Generate database name from config in request
        database_name = generate_database_name(request.dbConfig)

        # Run the query pipeline and get the full results, passing engine and metadata
        results, generated_sql, table_name, related_questions = user_query_runner.run_pipeline(
            request.query, 
            database_name,
            dbtype=request.dbConfig.type,
            engine=db_engine,
            metadata=metadata
        )
        
        # Format results for frontend
        formatted_results = format_query_results(results)
        
        # Add the generated SQL to the response
        formatted_results["query"] = generated_sql
        formatted_results["table_name"] = table_name
        formatted_results["related_questions"] = related_questions
        
        return {
            "status": "success",
            "results": formatted_results
        }
    except Exception as e:
        traceback.print_exc()  # Print the full error for debugging
        raise HTTPException(
            status_code=500,
            detail=f"Query execution failed: {str(e)}"
        )

def format_query_results(results):
    try:
        if isinstance(results, str):  # Error message
            return {"error": results, "columns": [], "rows": []}
        
        if not results:  # Empty results
            return {"columns": [], "rows": []}
        
        # Handle SQLAlchemy results
        if hasattr(results, 'keys'):  # Result proxy
            columns = list(results.keys())
            rows = [list(row) for row in results]
        else:  # List of tuples
            # For the first row, try to get column names
            first_row = results[0] if results else None
            if first_row and hasattr(first_row, '_fields'):
                columns = list(first_row._fields)
            else:
                columns = [f"Column {i}" for i in range(len(first_row))]
            rows = [list(row) for row in results]
        
        return {
            "columns": columns,
            "rows": rows,
            "display_query": False   # New flag to control frontend display
        }
    except Exception as e:
        traceback.print_exc()
        return {
            "error": f"Error formatting results: {str(e)}",
            "columns": [],
            "rows": []
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)