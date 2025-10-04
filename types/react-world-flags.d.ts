declare module 'react-world-flags' {
  import * as React from 'react';

  interface FlagProps {
    code: string;
    height?: string | number;
    width?: string | number;
    fallback?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
  }

  export default class Flag extends React.Component<FlagProps> {}
} 