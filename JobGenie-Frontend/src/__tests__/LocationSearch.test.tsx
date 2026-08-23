import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LocationSearch from '../components/location-search';
import {globalLocations} from '../data/globalLocations';

// Mock the global locations data
jest.mock('../data/globalLocations', () => ({
  globalLocations: [
    { name: 'San Francisco', country: 'United States', region: 'North America', currency: 'USD', symbol: '$' },
    { name: 'London', country: 'United Kingdom', region: 'Europe', currency: 'GBP', symbol: '£' },
    { name: 'Bengaluru', country: 'India', region: 'Asia', currency: 'INR', symbol: '₹' }
  ]
}));

describe('LocationSearch Component', () => {
  const mockOnLocationAdd = jest.fn();
  const mockOnLocationRemove = jest.fn();
  const mockOnCurrencyChange = jest.fn();

  const defaultProps = {
    selectedLocations: [],
    onLocationAdd: mockOnLocationAdd,
    onLocationRemove: mockOnLocationRemove,
    onCurrencyChange: mockOnCurrencyChange,
    placeholder: 'Search locations',
    maxLocations: 3
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render search input with placeholder', () => {
      render(<LocationSearch {...defaultProps} />);
      expect(screen.getByPlaceholderText('Search locations')).toBeInTheDocument();
    });

    it('should display selected locations', () => {
      const props = {
        ...defaultProps,
        selectedLocations: ['San Francisco', 'London']
      };
      
      render(<LocationSearch {...props} />);
      expect(screen.getByText('San Francisco')).toBeInTheDocument();
      expect(screen.getByText('London')).toBeInTheDocument();
    });

    it('should show currency indicators for selected locations', () => {
      const props = {
        ...defaultProps,
        selectedLocations: ['San Francisco', 'Bengaluru']
      };
      
      render(<LocationSearch {...props} />);
      expect(screen.getByText('$')).toBeInTheDocument();
      expect(screen.getByText('₹')).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('should filter locations based on search input', async () => {
      const user = userEvent.setup();
      render(<LocationSearch {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Search locations');
      await user.type(input, 'San');
      
      await waitFor(() => {
        expect(screen.getByText('San Francisco')).toBeInTheDocument();
        expect(screen.queryByText('London')).not.toBeInTheDocument();
      });
    });

    it('should show no results message for invalid search', async () => {
      const user = userEvent.setup();
      render(<LocationSearch {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Search locations');
      await user.type(input, 'NonexistentCity');
      
      await waitFor(() => {
        expect(screen.getByText('No locations found')).toBeInTheDocument();
      });
    });

    it('should clear search when input is empty', async () => {
      const user = userEvent.setup();
      render(<LocationSearch {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Search locations');
      await user.type(input, 'San');
      await user.clear(input);
      
      await waitFor(() => {
        expect(screen.queryByText('San Francisco')).not.toBeInTheDocument();
      });
    });
  });

  describe('Location Selection', () => {
    it('should call onLocationAdd when location is selected', async () => {
      const user = userEvent.setup();
      render(<LocationSearch {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Search locations');
      await user.type(input, 'San');
      
      await waitFor(() => {
        const option = screen.getByText('San Francisco');
        fireEvent.click(option);
      });
      
      expect(mockOnLocationAdd).toHaveBeenCalledWith('San Francisco');
    });

    it('should call onLocationRemove when location is deselected', () => {
      const props = {
        ...defaultProps,
        selectedLocations: ['San Francisco']
      };
      
      render(<LocationSearch {...props} />);
      const removeButton = screen.getByRole('button');
      fireEvent.click(removeButton);
      
      expect(mockOnLocationRemove).toHaveBeenCalledWith('San Francisco');
    });

    it('should call onCurrencyChange when location with different currency is selected', async () => {
      const user = userEvent.setup();
      render(<LocationSearch {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Search locations');
      await user.type(input, 'Bengaluru');
      
      await waitFor(() => {
        const option = screen.getByText('Bengaluru');
        fireEvent.click(option);
      });
      
      expect(mockOnCurrencyChange).toHaveBeenCalledWith('INR', '₹');
    });
  });

  describe('Location Limits', () => {
    it('should prevent adding more locations than maxLocations', async () => {
      const props = {
        ...defaultProps,
        selectedLocations: ['San Francisco', 'London', 'Bengaluru'],
        maxLocations: 3
      };
      
      const user = userEvent.setup();
      render(<LocationSearch {...props} />);
      
      const input = screen.getByPlaceholderText('Search locations');
      await user.type(input, 'New York');
      
      // Should not show options when at max capacity
      await waitFor(() => {
        expect(screen.queryByText('New York')).not.toBeInTheDocument();
      });
    });

    it('should show limit reached message', () => {
      const props = {
        ...defaultProps,
        selectedLocations: ['San Francisco', 'London', 'Bengaluru'],
        maxLocations: 3
      };
      
      render(<LocationSearch {...props} />);
      expect(screen.getByText('Maximum 3 locations allowed')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<LocationSearch {...defaultProps} />);
      
      const input = screen.getByRole('combobox');
      expect(input).toHaveAttribute('aria-expanded', 'false');
      expect(input).toHaveAttribute('aria-autocomplete', 'list');
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<LocationSearch {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Search locations');
      await user.type(input, 'San');
      
      // Arrow down to select option
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');
      
      expect(mockOnLocationAdd).toHaveBeenCalledWith('San Francisco');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty locations array', () => {
      // Mock empty locations
      jest.mocked(globalLocations).mockReturnValue([]);
      
      render(<LocationSearch {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search locations');
      expect(input).toBeInTheDocument();
    });

    it('should handle special characters in search', async () => {
      const user = userEvent.setup();
      render(<LocationSearch {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Search locations');
      await user.type(input, 'São Paulo');
      
      // Should not crash on special characters
      expect(input).toHaveValue('São Paulo');
    });

    it('should prevent duplicate location selection', async () => {
      const props = {
        ...defaultProps,
        selectedLocations: ['San Francisco']
      };
      
      const user = userEvent.setup();
      render(<LocationSearch {...props} />);
      
      const input = screen.getByPlaceholderText('Search locations');
      await user.type(input, 'San Francisco');
      
      // Already selected location should not appear in options
      await waitFor(() => {
        expect(screen.queryByText('San Francisco')).not.toBeInTheDocument();
      });
    });
  });
});