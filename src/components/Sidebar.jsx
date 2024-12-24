// components/Sidebar.jsx
import styled from 'styled-components';
import { RiDatabaseLine, RiCheckLine, RiTableLine, RiBarChartLine } from 'react-icons/ri';
import { useState, useEffect } from 'react';

const CLOUD_PLATFORMS = [
  // 'Snowflake',
  // 'Amazon Redshift',
  // 'Google BigQuery',
  // 'Azure Synapse',
  // 'SAP HANA',
  // 'Databricks Delta Lake',
  // 'Starburst Trino',
  // 'Presto',
  // 'Oracle ADW',
  // 'Teradata Vantage',
  // 'Dremio'
  'PostgreSQL'
];

const Nav = styled.nav`
  background: #1a2233;
  color: white;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const NavItem = styled.div`
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
  background: ${props => props.active ? 'rgba(255, 255, 255, 0.1)' : 'transparent'};

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
`;

const ConfigModal = styled.div`
  position: fixed;
  left: 100px;
  top: 20px;
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  z-index: 1000;
  width: 300px;
  color: black;
`;

const Input = styled.input`
  width: 100%;
  padding: 8px;
  margin: 8px 0;
`;

const Select = styled.select`
  width: 100%;
  padding: 8px;
  margin: 8px 0;
`;

const Button = styled.button`
  width: 100%;
  padding: 8px 16px;
  margin: 8px 0;
  border: none;
  border-radius: 4px;
  background: #007bff;
  color: white;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #0056b3;
  }
`;

const RadioGroup = styled.div`
  margin: 12px 0;
`;

const RadioLabel = styled.label`
  display: block;
  margin: 8px 0;
  cursor: pointer;
`;

const ErrorMessage = styled.div`
  color: #dc3545;
  font-size: 12px;
  margin: 4px 0;
`;

const ConnectionStatus = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 4px;
  background: ${props => props.isConnected ? '#d4edda' : '#f8d7da'};
  color: ${props => props.isConnected ? '#155724' : '#721c24'};
  margin-bottom: 12px;
`;

const LoadingSpinner = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin: 10px 0;
  
  .spinner {
    border: 3px solid #f3f3f3;
    border-top: 3px solid #007bff;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .message {
    font-size: 14px;
    color: #666;
    text-align: center;
  }
`;

function Sidebar({ onTablesUpdate, currentView, onViewChange, onTitleChange }) {
  const [showConfig, setShowConfig] = useState(false);
  const [dbType, setDbType] = useState('default');
  const [formData, setFormData] = useState({
    host: '',
    port: '',
    database: '',
    username: '',
    password: '',
    platform: ''
  });
  const [selectedDb, setSelectedDb] = useState('northwind.db');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [loadingStage, setLoadingStage] = useState(0);
  
  const loadingMessages = [
    'Connecting to database...',
    'Analyzing database structure...',
    'Generating table descriptions...',
    'Creating knowledge graph in RAG...',
    'Generating semantic embeddings...',
    'Finalizing setup...'
  ];

  useEffect(() => {
    if (isLoading && loadingStage < loadingMessages.length - 1) {
      const timer = setTimeout(() => {
        setLoadingStage(prev => prev + 1);
      }, 1000); // Increased to 3.5 seconds per message
      return () => clearTimeout(timer);
    }
  }, [isLoading, loadingStage]);

  const defaultDatabases = ['northwind.db'];

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const validateForm = () => {
    if (dbType === 'custom') {
      if (!formData.host || !formData.port || !formData.database) {
        setError('Please fill in all required fields');
        return false;
      }
    }
    setError('');
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    try {
      setIsLoading(true);
      setLoadingStage(0);
      
      await new Promise(resolve => setTimeout(resolve, 2000));

      const config = dbType === 'default' 
        ? { type: 'default', database: selectedDb }
        : {
            type: 'custom',
            host: formData.host,
            port: formData.port,
            database: formData.database,
            username: formData.username,
            password: formData.password,
            platform: formData.platform
          };

      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/configure-db`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      const data = await response.json();
      
      if (data.status === 'success') {
        await new Promise(resolve => setTimeout(resolve, 5000));
        setIsConnected(true);
        setError('');
        onTablesUpdate(data.table_descriptions, config); // Pass config here
        handleViewChange('tables');
        setShowConfig(false);
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      setError('Failed to connect to database: ' + err.message);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
      setLoadingStage(0);
    }
  };

  const handleViewChange = (view) => {
    onViewChange(view);
    if (view === 'tables') {
      onTitleChange('Database Tables');
    } else if (view === 'queries') {
      onTitleChange('Reports');
    }
  };

  return (
    <Nav>
      <NavItem 
        onClick={() => setShowConfig(true)}
        title="Configure Database"
      >
        <RiDatabaseLine size={24} />
      </NavItem>
      
      <NavItem 
        active={currentView === 'queries'}
        onClick={() => handleViewChange('queries')}
        title="View Reports"
      >
        <RiBarChartLine size={24} />
      </NavItem>
      
      <NavItem 
        active={currentView === 'tables'}
        onClick={() => handleViewChange('tables')}
        title="View Database Tables"
      >
        <RiTableLine size={24} />
      </NavItem>
      
      {showConfig && (
        <ConfigModal>
          <h3>Database Configuration</h3>
          
          {isConnected && (
            <ConnectionStatus isConnected={true}>
              <RiCheckLine /> Connected to database
            </ConnectionStatus>
          )}

          <RadioGroup>
            <RadioLabel>
              <input
                type="radio"
                name="dbType"
                value="default"
                checked={dbType === 'default'}
                onChange={(e) => setDbType(e.target.value)}
              />
              Use Default Database
            </RadioLabel>
            <RadioLabel>
              <input
                type="radio"
                name="dbType"
                value="custom"
                checked={dbType === 'custom'}
                onChange={(e) => setDbType(e.target.value)}
              />
              Custom SQL Database
            </RadioLabel>
          </RadioGroup>

          {dbType === 'default' ? (
            <Select 
              value={selectedDb}
              onChange={(e) => setSelectedDb(e.target.value)}
            >
              {defaultDatabases.map(db => (
                <option key={db} value={db}>{db}</option>
              ))}
            </Select>
          ) : (
            <>
              <Select
                name="platform"
                value={formData.platform}
                onChange={handleInputChange}
              >
                <option value="">Select Cloud Platform</option>
                {CLOUD_PLATFORMS.map(platform => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </Select>
              <Input 
                placeholder="Host"
                name="host"
                value={formData.host}
                onChange={handleInputChange}
              />
              <Input 
                placeholder="Port"
                name="port"
                value={formData.port}
                onChange={handleInputChange}
              />
              <Input 
                placeholder="Database Name"
                name="database"
                value={formData.database}
                onChange={handleInputChange}
              />
              <Input 
                placeholder="Username (optional)"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
              />
              <Input 
                type="password"
                placeholder="Password (optional)"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
              />
            </>
          )}
          
          {error && <ErrorMessage>{error}</ErrorMessage>}
          
          {isLoading && (
            <LoadingSpinner>
              <div className="spinner" />
              <div className="message">{loadingMessages[loadingStage]}</div>
            </LoadingSpinner>
          )}
          
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? 'Configuring...' : isConnected ? 'Update Configuration' : 'Test Connection & Save'}
          </Button>
          
          {isConnected && (
            <Button onClick={() => setShowConfig(false)}>
              Close
            </Button>
          )}
        </ConfigModal>
      )}
    </Nav>
  );
}

export default Sidebar;