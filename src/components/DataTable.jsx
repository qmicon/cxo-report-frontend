// components/DataTable.jsx 
import React from 'react';
import styled from 'styled-components';

const Table = styled.table`
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  margin: 16px 0;
  white-space: nowrap;
`;

const Tr = styled.tr`
  transition: background 0.2s;
  &:hover {
    background: #f0f2f5;
  }
`;

const Th = styled.th`
  padding: 12px;
  text-align: left;
  background: #f8f9fa;
  font-weight: 600;
  color: #444;
`;

const Td = styled.td`
  padding: 12px;
  border-top: 1px solid #eee;
`;

function DataTable({ columns, data }) {
  return (
    <Table>
      <thead>
        <Tr>
          {columns.map(col => <Th key={col}>{col}</Th>)}
        </Tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <Tr key={i}>
            {row.map((cell, j) => (
              <Td key={j}>
                {React.isValidElement(cell) ? cell : cell}
              </Td>
            ))}
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

export default DataTable;