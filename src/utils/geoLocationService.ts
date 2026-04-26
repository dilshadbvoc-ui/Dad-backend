export const GeoLocationService = {
    /**
     * Detects country information from a phone number string
     */
    detectCountryFromPhone: (phone: string) => {
        if (!phone) return null;
        
        const cleanPhone = phone.toString().replace(/\D/g, '');
        
        // India
        if (cleanPhone.startsWith('91') || (cleanPhone.length === 10 && !cleanPhone.startsWith('0'))) {
            return {
                country: 'India',
                countryCode: 'IN',
                phoneCountryCode: '91'
            };
        }
        
        // Default / Unknown
        return {
            country: 'International',
            countryCode: null,
            phoneCountryCode: null
        };
    }
};
