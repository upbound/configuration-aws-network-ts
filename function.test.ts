import { describe, it, expect } from '@jest/globals';
import { formatCIDR } from './function.js';

describe('formatCIDR', () => {
    it('should convert a standard CIDR block with slash notation', () => {
        expect(formatCIDR('192.168.0.1/24')).toBe('192-168-0-1-24');
    });

    it('should convert CIDR block 10.0.0.0/16', () => {
        expect(formatCIDR('10.0.0.0/16')).toBe('10-0-0-0-16');
    });

    it('should convert CIDR block 172.16.0.0/12', () => {
        expect(formatCIDR('172.16.0.0/12')).toBe('172-16-0-0-12');
    });

    it('should handle CIDR with /32 subnet mask', () => {
        expect(formatCIDR('192.168.1.1/32')).toBe('192-168-1-1-32');
    });

    it('should handle CIDR with /8 subnet mask', () => {
        expect(formatCIDR('10.0.0.0/8')).toBe('10-0-0-0-8');
    });

    it('should handle larger octet values', () => {
        expect(formatCIDR('255.255.255.255/32')).toBe('255-255-255-255-32');
    });

    it('should handle IPv6-like input if provided', () => {
        expect(formatCIDR('2001:db8::1/64')).toBe('2001:db8::1-64');
    });

    it('should handle edge case with multiple consecutive dots', () => {
        expect(formatCIDR('192..168.0.1/24')).toBe('192--168-0-1-24');
    });
});
