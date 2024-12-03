// components/Sidebar.jsx
import styled from 'styled-components';
import { RiDatabaseLine, RiCheckLine, RiTableLine, RiBarChartLine } from 'react-icons/ri';
import { useState } from 'react';

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

function Sidebar({ onTablesUpdate, currentView, onViewChange, onTitleChange }) {
  const [showConfig, setShowConfig] = useState(false);
  const [dbType, setDbType] = useState('default');
  const [formData, setFormData] = useState({
    host: '',
    port: '',
    database: '',
    username: '',
    password: '',
    endpoint: ''
  });
  const [selectedDb, setSelectedDb] = useState('sample_db');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState('');

  const defaultDatabases = ['sample_db', 'revenue_db', 'analytics_db'];

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
      const config = dbType === 'default' 
        ? { type: 'default', database: selectedDb }
        : {
            type: 'custom',
            host: formData.host,
            port: formData.port,
            database: formData.database,
            username: formData.username,
            password: formData.password
          };

      const response = await fetch('http://localhost:8000/api/configure-db', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      const data = await response.json();
      
      if (data.status === 'success') {
        setIsConnected(true);
        setError('');
        onTablesUpdate(data.table_descriptions);
        handleViewChange('tables'); // Add this line to switch view
        setShowConfig(false);   // Close config modal after success
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      setError('Failed to connect to database: ' + err.message);
      setIsConnected(false);
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
          
          <Button onClick={handleSave}>
            {isConnected ? 'Update Configuration' : 'Test Connection & Save'}
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