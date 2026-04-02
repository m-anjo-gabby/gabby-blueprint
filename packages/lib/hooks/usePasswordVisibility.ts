// src/hooks/usePasswordVisibility.ts
import { useState } from 'react';

export const usePasswordVisibility = () => {
  const [isVisible, setIsVisible] = useState(false);
  
  const toggleVisibility = () => setIsVisible((prev) => !prev);
  const type = isVisible ? 'text' : 'password';
  
  return { isVisible, toggleVisibility, type };
};