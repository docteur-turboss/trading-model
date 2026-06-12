import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SeverityBadge } from '../../src/components/severity-badge';

describe('SeverityBadge', () => {
  it('should render with severity text', () => {
    render(<SeverityBadge severity="INFO" />);
    expect(screen.getByText('INFO')).toBeInTheDocument();
  });

  it('should render WARNING severity', () => {
    render(<SeverityBadge severity="WARNING" />);
    expect(screen.getByText('WARNING')).toBeInTheDocument();
  });

  it('should render ERROR severity', () => {
    render(<SeverityBadge severity="ERROR" />);
    expect(screen.getByText('ERROR')).toBeInTheDocument();
  });

  it('should render CRITICAL severity', () => {
    render(<SeverityBadge severity="CRITICAL" />);
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
  });

  it('should handle lowercase severity input', () => {
    render(<SeverityBadge severity="warning" />);
    expect(screen.getByText('warning')).toBeInTheDocument();
  });

  it('should handle unknown severity gracefully', () => {
    render(<SeverityBadge severity="UNKNOWN" />);
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
  });
});
