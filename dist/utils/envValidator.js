"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnvironmentValidator = void 0;
const crypto_1 = __importDefault(require("crypto"));
class EnvironmentValidator {
    /**
     * Validate all environment variables
     */
    static validate() {
        const errors = [];
        const warnings = [];
        // Check required variables
        for (const varName of this.REQUIRED_VARS) {
            const value = process.env[varName];
            if (!value) {
                errors.push(`Missing required environment variable: ${varName}`);
                continue;
            }
            // Validate secret strength
            if (varName.includes('SECRET') || varName.includes('JWT')) {
                const secretValidation = this.validateSecret(varName, value);
                if (!secretValidation.isValid) {
                    errors.push(...secretValidation.errors);
                }
                warnings.push(...secretValidation.warnings);
            }
        }
        // Production-specific checks
        if (process.env.NODE_ENV === 'production') {
            for (const varName of this.PRODUCTION_REQUIRED_VARS) {
                const value = process.env[varName];
                if (!value) {
                    errors.push(`Missing production environment variable: ${varName}`);
                }
                else if (this.isDefaultValue(varName, value)) {
                    errors.push(`Production environment variable ${varName} is using default/insecure value`);
                }
            }
            // Check HTTPS enforcement
            if (!process.env.FORCE_HTTPS && !process.env.HTTPS_ONLY) {
                warnings.push('Consider setting FORCE_HTTPS=true for production');
            }
        }
        // Database URL validation
        if (process.env.DATABASE_URL) {
            const dbValidation = this.validateDatabaseUrl(process.env.DATABASE_URL);
            if (!dbValidation.isValid) {
                errors.push(...dbValidation.errors);
            }
            warnings.push(...dbValidation.warnings);
        }
        // CORS validation
        if (process.env.ALLOWED_ORIGINS) {
            const corsValidation = this.validateCorsOrigins(process.env.ALLOWED_ORIGINS);
            if (!corsValidation.isValid) {
                warnings.push(...corsValidation.errors);
            }
        }
        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
    /**
     * Validate secret strength
     */
    static validateSecret(name, secret) {
        const errors = [];
        const warnings = [];
        if (secret.length < this.MIN_SECRET_LENGTH) {
            errors.push(`${name} must be at least ${this.MIN_SECRET_LENGTH} characters long`);
        }
        // Check for weak patterns
        if (/^[a-zA-Z0-9]+$/.test(secret) && secret.length < 64) {
            warnings.push(`${name} should contain special characters for better security`);
        }
        // Check entropy
        const entropy = this.calculateEntropy(secret);
        if (entropy < 4.0) {
            warnings.push(`${name} has low entropy (${entropy.toFixed(2)}). Consider using a more random secret`);
        }
        return { isValid: errors.length === 0, errors, warnings };
    }
    /**
     * Check if value is a known default/insecure value
     */
    static isDefaultValue(name, value) {
        const defaultValues = {
            'META_VERIFY_TOKEN': ['my_secure_token', 'verify_token', 'test_token'],
            'WHATSAPP_VERIFY_TOKEN': ['my_whatsapp_secure_token', 'whatsapp_token', 'test_token'],
            'JWT_SECRET': ['secret_key_change_this', 'your_secret_key_here', 'jwt_secret'],
            'META_WEBHOOK_SECRET': ['webhook_secret', 'meta_secret', 'your_webhook_secret_here'],
            'WHATSAPP_WEBHOOK_SECRET': ['your_whatsapp_webhook_secret_here', 'whatsapp_secret']
        };
        const defaults = defaultValues[name] || [];
        return defaults.some(defaultVal => value.toLowerCase().includes(defaultVal.toLowerCase()));
    }
    /**
     * Validate database URL
     */
    static validateDatabaseUrl(url) {
        const errors = [];
        const warnings = [];
        try {
            const parsed = new URL(url);
            // Check protocol
            if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
                errors.push('Database URL must use postgresql:// protocol');
            }
            // Check SSL mode for production
            if (process.env.NODE_ENV === 'production') {
                if (!url.includes('sslmode=require') && !url.includes('ssl=true')) {
                    warnings.push('Consider enabling SSL for production database (sslmode=require)');
                }
            }
            // Check for credentials in URL (security warning)
            if (parsed.username && parsed.password) {
                warnings.push('Database credentials in URL. Consider using connection pooling or IAM authentication');
            }
        }
        catch (error) {
            errors.push('Invalid database URL format');
        }
        return { isValid: errors.length === 0, errors, warnings };
    }
    /**
     * Validate CORS origins
     */
    static validateCorsOrigins(origins) {
        const errors = [];
        const originList = origins.split(',').map(o => o.trim());
        for (const origin of originList) {
            if (origin === '*') {
                errors.push('Wildcard (*) CORS origin is not allowed for security');
                continue;
            }
            try {
                new URL(origin);
            }
            catch {
                errors.push(`Invalid CORS origin format: ${origin}`);
            }
        }
        return { isValid: errors.length === 0, errors, warnings: [] };
    }
    /**
     * Calculate Shannon entropy of a string
     */
    static calculateEntropy(str) {
        const freq = {};
        for (const char of str) {
            freq[char] = (freq[char] || 0) + 1;
        }
        let entropy = 0;
        const len = str.length;
        for (const count of Object.values(freq)) {
            const p = count / len;
            entropy -= p * Math.log2(p);
        }
        return entropy;
    }
    /**
     * Generate secure random secret
     */
    static generateSecureSecret(length = 64) {
        return crypto_1.default.randomBytes(length).toString('base64url');
    }
    /**
     * Initialize environment validation on startup
     */
    static initializeValidation() {
        const result = this.validate();
        if (result.errors.length > 0) {
            console.error('❌ Environment Validation Errors:');
            result.errors.forEach(error => console.error(`  - ${error}`));
            if (process.env.NODE_ENV === 'production') {
                console.error('🚨 Exiting due to environment validation errors in production');
                process.exit(1);
            }
        }
        if (result.warnings.length > 0) {
            console.warn('⚠️  Environment Validation Warnings:');
            result.warnings.forEach(warning => console.warn(`  - ${warning}`));
        }
        if (result.errors.length === 0 && result.warnings.length === 0) {
            console.log('✅ Environment validation passed');
        }
    }
}
exports.EnvironmentValidator = EnvironmentValidator;
EnvironmentValidator.REQUIRED_VARS = [
    'DATABASE_URL',
    'JWT_SECRET',
    'META_APP_SECRET',
    'META_WEBHOOK_SECRET',
    'WHATSAPP_WEBHOOK_SECRET'
];
EnvironmentValidator.PRODUCTION_REQUIRED_VARS = [
    'META_VERIFY_TOKEN',
    'WHATSAPP_VERIFY_TOKEN',
    'ALLOWED_ORIGINS'
];
EnvironmentValidator.MIN_SECRET_LENGTH = 32;
