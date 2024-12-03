import React from 'react';
import styled from 'styled-components';

const HeaderContainer = styled.header`
  background: #1a2233;
  color: white;
  padding: 20px;
  text-align: center;
`;

function Header({ title }) {
  return (
    <HeaderContainer>
      <h1>{title}</h1>
    </HeaderContainer>
  );
}

export default Header;