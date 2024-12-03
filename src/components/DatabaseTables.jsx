import React from 'react';
import styled from 'styled-components';
import ReactMarkdown from 'react-markdown';
import DataTable from './DataTable';

const Container = styled.div`
  padding: 20px;
`;

const Title = styled.h2`
  margin-bottom: 20px;
`;

const TableWrapper = styled.div`
  overflow-x: auto;
  width: 100%;
  border-radius: 4px;
`;

const DescriptionCell = styled.div`
  font-size: 0.9em;
  line-height: 1.6;
  white-space: normal;
  max-width: 800px;
  overflow-wrap: break-word;
  word-wrap: break-word;
  
  p {
    margin: 0.5em 0;
  }
  
  ul {
    margin: 0.5em 0;
    padding-left: 1.5em;
  }
  
  strong {
    color: #2c3e50;
  }
  
  code {
    background: #f8f9fa;
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 0.9em;
    color: #e83e8c;
  }
`;

function DatabaseTables({ tableDescriptions }) {
  const formattedData = Object.entries(tableDescriptions).map(([table, desc]) => [
    table,
    <DescriptionCell>
      <ReactMarkdown>{desc}</ReactMarkdown>
    </DescriptionCell>
  ]);

  return (
    <Container>
      <TableWrapper>
        <DataTable 
          columns={['Table Name', 'Description']}
          data={formattedData}
        />
      </TableWrapper>
    </Container>
  );
}

export default DatabaseTables;