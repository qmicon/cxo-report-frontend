// App.jsx
import React, { useState, useRef } from 'react';
import styled from 'styled-components';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DataTable from './components/DataTable';
import Chat from './components/Chat';
import { RiFileDownloadLine, RiShareLine, RiSearchEyeLine } from 'react-icons/ri';
import DatabaseTables from './components/DatabaseTables';

const Container = styled.div`
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr) 300px;
  height: 100vh;
  overflow: hidden;
`;

const MainContent = styled.div`
  padding: 20px;
  padding-right: 30px;
  background: #f5f6fa;
  min-width: 100%;
  width: 100%;
  box-sizing: border-box;
  overflow-x: hidden;
  height: 100vh;
  overflow-y: auto;
`;

const Button = styled.button`
  background: #fff;
  border: 1px solid #ddd;
  padding: 8px 16px;
  margin: 8px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: #f0f2f5;
    transform: translateY(-1px);
  }

  svg {
    font-size: 18px;
  }
`;

const DownloadButton = styled(Button)`
  margin-left: auto;
  padding: 6px 12px;
  font-size: 0.9em;
`;

const QueryResultSection = styled.div`
  margin-bottom: 30px;
`;

const QueryTimestamp = styled.p`
  color: #666;
  font-size: 0.9em;
`;

const QuerySQL = styled.pre`
  background: #f8f9fa;
  padding: 12px;
  border-radius: 4px;
  margin: 10px 0;
`;

const QueryHeader = styled.h2`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const QueryHeaderContainer = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 16px;
`;

const QueryText = styled.span`
  font-size: 0.8em;
  color: #666;
  font-weight: normal;
`;

const MoreRowsText = styled.div`
  text-align: center;
  padding: 12px;
  color: #666;
  background: #f8f9fa;
  border-radius: 0 0 8px 8px;
  font-size: 0.9em;
`;

const RelatedQuestions = styled.div`
  margin-top: 20px;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 4px;
`;

const RelatedQuestion = styled.p`
  margin: 5px 0;
  color: #007bff;
  cursor: pointer;
  &:hover {
    text-decoration: underline;
  }
`;

const TableScrollWrapper = styled.div`
  overflow-x: auto;
  width: 100%;
  border-radius: 4px;
  max-width: 100%;
`;

function App() {
  const ROW_LIMIT = 10; // Configure row limit here
  const mainContentRef = useRef(null); // Add this line
  const [tableDescriptions, setTableDescriptions] = useState({});
  const [queryHistory, setQueryHistory] = useState([]);
  const [currentView, setCurrentView] = useState('queries');
  const [title, setTitle] = useState('Reports');
  const [dbConfig, setDbConfig] = useState(null);  // Add this line
  const chatRef = useRef();

  const handleTablesUpdate = (descriptions, config) => {  // Add config parameter
    setTableDescriptions(descriptions);
    setDbConfig(config);  // Store the db config
  };

  const handleQueryResults = (results, userQuery) => {
    setCurrentView('queries'); // Switch to queries view when results are received
    scrollToTop();
    setQueryHistory(prev => [{
      id: Date.now(),
      timestamp: new Date().toLocaleString(),
      userQuery,  // Store the user's natural language query
      ...results
    }, ...prev]);
  };

  const convertToCSV = (result) => {
    // Add metadata section
    const metadata = [
      `User Query: ${result.userQuery}`,
      `Generated at: ${result.timestamp}`,
      `SQL Query: ${result.query}`,  // Include SQL query in CSV
      '',  // Empty line to separate metadata from data
    ].join('\n');

    // Add headers and data
    const headers = result.columns.join(',');
    const rows = result.rows.map(row => 
      row.map(cell => {
        if (cell === null || cell === undefined) return '';
        const cellStr = cell.toString();
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(',')
    ).join('\n');

    return `${metadata}\n${headers}\n${rows}`;
  };

  const handleDownload = (result) => {
    const csvContent = convertToCSV(result);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query-result-${result.id}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const getDisplayData = (data, limit) => {
    if (!data || !data.length) return [];

    // Get columns with any valid data
    const columnsWithData = data[0].map((_, colIndex) => {
      return data.some(row => {
        const cell = row[colIndex];
        if (cell === null || cell === undefined || cell === '') return false;
        const numValue = parseFloat(cell);
        return isNaN(numValue) || numValue !== 0;
      });
    });

    const idColumnIndices = data.columns
      ?.map((col, idx) => col.toLowerCase().includes('id') ? idx : -1)
      .filter(idx => idx !== -1) || [];

    let validRows = [];
    let currentBlock = [];

    for (const row of data) {
      const isValidRow = row.every((cell, idx) => {
        // Always accept ID columns
        if (idColumnIndices.includes(idx)) return true;
        // Skip validation for columns that are all empty/zero
        if (!columnsWithData[idx]) return true;
        
        if (cell === null || cell === undefined || cell === '') return false;
        const numValue = parseFloat(cell);
        return isNaN(numValue) || numValue !== 0;
      });

      if (isValidRow) {
        currentBlock.push(row);
        if (currentBlock.length >= limit) {
          validRows = currentBlock.slice(0, limit);
          break;
        }
      } else {
        if (currentBlock.length > validRows.length) {
          validRows = [...currentBlock];
        }
        currentBlock = [];
      }
    }

    if (currentBlock.length > validRows.length) {
      validRows = currentBlock.slice(0, limit);
    }

    return validRows;
  };

  const scrollToTop = () => {
    if (mainContentRef.current) {
      mainContentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <Container>
      <Sidebar 
        onTablesUpdate={handleTablesUpdate}
        currentView={currentView}
        onViewChange={setCurrentView}
        onTitleChange={setTitle}
      />
      <MainContent ref={mainContentRef}>
        <Header title={title} />
        {currentView === 'queries' ? (
          queryHistory.map((result, index) => {
            const displayRows = getDisplayData(result.rows, ROW_LIMIT);
            const remainingRows = result.rows.length - ROW_LIMIT;
            
            return (
              <QueryResultSection key={result.id}>
                <QueryHeaderContainer>
                  <div>
                    <QueryHeader>
                      {queryHistory.length - index}: {result.table_name}
                    </QueryHeader>
                    <QueryTimestamp>Generated at: {result.timestamp}</QueryTimestamp>
                  </div>
                  <DownloadButton onClick={() => handleDownload(result)}>
                    <RiFileDownloadLine /> Download
                  </DownloadButton>
                </QueryHeaderContainer>
                <TableScrollWrapper>
                  <DataTable 
                    columns={result.columns}
                    data={displayRows}
                  />
                </TableScrollWrapper>
                {remainingRows > 0 && (
                  <MoreRowsText>
                    {remainingRows} more rows available. Download the full results to view all data.
                  </MoreRowsText>
                )}
                <RelatedQuestions>
                  <h4>Related Questions:</h4>
                  {result.related_questions.map((question, idx) => (
                    <RelatedQuestion 
                      key={idx} 
                      onClick={() => chatRef.current.handleExternalMessage(question)}
                    >
                      {question}
                    </RelatedQuestion>
                  ))}
                </RelatedQuestions>
              </QueryResultSection>
            );
          })
        ) : (
          <DatabaseTables tableDescriptions={tableDescriptions} />
        )}
      </MainContent>
      <Chat ref={chatRef} onQueryResults={handleQueryResults} dbConfig={dbConfig} />  {/* Add dbConfig prop */}
    </Container>
  );
}

export default App;