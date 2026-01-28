const testLogin = async () => {
    try {
        console.log('Attempting login with superadmin@crm.com / password123');
        const response = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'superadmin@crm.com',
                password: 'password123'
            })
        });

        console.log('Login Status:', response.status);
        const data = await response.json();

        if (response.ok) {
            console.log('Login Success. Token received:', !!data.token);
            console.log('User Role:', data.role);
        } else {
            console.log('Login Failed. Message:', data.message);
        }
    } catch (error) {
        console.error('Network Error:', error.message);
    }
};

testLogin();
