import React, { useState, useImperativeHandle, forwardRef, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { RiSendPlaneFill } from 'react-icons/ri';

const ChatContainer = styled.div`
  background: #fff;
  border-left: 1px solid #ddd;
  display: flex;
  flex-direction: column;
  height: 100vh;
  position: sticky;
  top: 0;
  overflow: hidden;
`;

const ChatHeader = styled.div`
  padding: 20px;
  border-bottom: 1px solid #ddd;
  font-weight: bold;
`;

const ChatMessages = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  scroll-behavior: smooth;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: #ccc;
    border-radius: 3px;
  }
`;

const Message = styled.div`
  margin: 8px 0;
  padding: 10px;
  border-radius: 8px;
  max-width: 80%;
  word-break: break-word;
  ${props => props.isUser ? `
    background: #007bff;
    color: white;
    align-self: flex-end;
  ` : props.isCode ? `
    background: #1e1e1e;
    color: #e6e6e6;
    font-family: monospace;
    white-space: pre-wrap;
    width: calc(100% - 20px);
    max-width: calc(100% - 20px);
  ` : `
    background: #f0f2f5;
    color: black;
    align-self: flex-start;
  `}
`;

const InputContainer = styled.div`
  padding: 20px;
  border-top: 1px solid #ddd;
  display: flex;
  gap: 10px;
`;

const Input = styled.input`
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
`;

const SendButton = styled.button`
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
`;

function Chat({ onQueryResults }, ref) {  // Add ref parameter
  const [messages, setMessages] = useState([
    { text: "Hi, how can I help you analyze the revenue data?", isUser: false }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const handleMessage = async (message) => {
    if (!message.trim()) return;
    
    try {
      setIsLoading(true);
      setMessages(prev => [...prev, 
        { text: message, isUser: true },
        { text: "Fetching details...", isUser: false, isLoading: true }
      ]);

      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/run-query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: message }),
      });

      const data = await response.json();
      
      if (data.status === 'success') {
        // Keep showing SQL query in chat
        setMessages(prev => [
          ...prev.filter(msg => !msg.isLoading),
          { text: "Here's the SQL query:", isUser: false },
          { text: data.results.query, isUser: false, isCode: true },
          { text: "Query executed successfully! Check the results in the reports view.", isUser: false }
        ]);
        
        onQueryResults(data.results, message);
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev.filter(msg => !msg.isLoading),
        { text: "Sorry, I couldn't process your query: " + err.message, isUser: false }
      ]);
    } finally {
      setIsLoading(false);
      setInput("");
    }
  };

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useImperativeHandle(ref, () => ({
    handleExternalMessage: handleMessage
  }));

  return (
    <ChatContainer>
      <ChatHeader>Chat Assistant</ChatHeader>
      <ChatMessages>
        {messages.map((message, index) => (
          <Message 
            key={index} 
            isUser={message.isUser} 
            isCode={message.isCode}
            style={message.isLoading ? { opacity: 0.6 } : {}}
          >
            {message.text}
          </Message>
        ))}
        <div ref={messagesEndRef} />
      </ChatMessages>
      <InputContainer>
        <Input 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your data..."
          onKeyUp={(e) => e.key === 'Enter' && handleMessage(input)}
        />
        <SendButton onClick={() => handleMessage(input)}>
          <RiSendPlaneFill size={20} />
        </SendButton>
      </InputContainer>
    </ChatContainer>
  );
}

export default forwardRef(Chat);  // Use forwardRef to pass ref