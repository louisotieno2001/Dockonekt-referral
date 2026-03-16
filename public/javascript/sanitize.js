function sanitizeEmail(email) {
    // Define a regex pattern for validating email addresses
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    
    // Create an object to hold the result
    const result = {
        isValid: false,
        sanitizedEmail: null,
        errorMessage: ''
    };
    
    // Validate the email address
    if (emailRegex.test(email)) {
        result.isValid = true;
        result.sanitizedEmail = email;
        result.errorMessage = ''; // No error
    } else {
        result.errorMessage = 'Invalid email address. Please enter a valid email. e.g johndoe@gmail.com';
    }
    
    return result;
}

function sanitizePhoneNumber(phoneNumber) {
    // Define a regex pattern for validating international phone numbers with at least 10 digits
    const phoneRegex = /^(?:\+?\d{1,4}[-.\s]?)?(?:\(?\d{1,5}\)?[-.\s]?)?\d{10,15}$/;

    // Create an object to hold the result
    const result = {
        isValid: false,
        sanitizedPhoneNumber: null,
        errorMessage: ''
    };

    // Validate the phone number
    if (phoneRegex.test(phoneNumber)) {
        result.isValid = true;
        result.sanitizedPhoneNumber = phoneNumber.replace(/[^0-9]/g, ''); // Remove non-digit characters
        result.errorMessage = ''; // No error
    } else {
        result.errorMessage = 'Invalid phone number. Please enter a valid phone number with at least 10 digits.';
    }

    return result;
}

function sanitizeName(name) {
    // Define a regex pattern for valid names
    // Allows letters, spaces, apostrophes, and accents
    const nameRegex = /^[A-Za-zÀ-ÖØ-Ýà-öø-ÿ' ]+$/;

    // Trim leading and trailing whitespace
    let sanitized = name.trim();

    // Split the name into parts
    const nameParts = sanitized.split(' ');

    // Check if there are at least two parts and each part is at least 2 characters long and valid
    const arePartsValid = nameParts.length >= 2 && 
        nameParts.every(part => part.length >= 2 && nameRegex.test(part));

    if (arePartsValid) {
        // Capitalize each word in the name
        sanitized = nameParts
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');

        return {
            isValid: true,
            sanitizedName: sanitized,
            errorMessage: ''
        };
    } else {
        return {
            isValid: false,
            sanitizedName: null,
            errorMessage: 'Please enter both a first name and a last name, each at least 2 characters long, and containing only valid special characters.'
        };
    }
}

function isStrongPassword(password) {
    // Define regex patterns for different character types
    const hasUppercase = /[A-Z]/;
    const hasLowercase = /[a-z]/;
    const hasDigit = /\d/;
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/;
    
    // Check password length (minimum of 8 characters)
    if (password.length < 8) {
        return { isValid: false, reason: 'Password must be at least 8 characters long.' };
    }
    
    // Check for required character types
    if (!hasUppercase.test(password)) {
        return { isValid: false, reason: 'Password must contain at least one uppercase letter.' };
    }
    if (!hasLowercase.test(password)) {
        return { isValid: false, reason: 'Password must contain at least one lowercase letter.' };
    }
    if (!hasDigit.test(password)) {
        return { isValid: false, reason: 'Password must contain at least one digit.' };
    }
    if (!hasSpecialChar.test(password)) {
        return { isValid: false, reason: 'Password must contain at least one special character.' };
    }
    
    // If all checks pass
    return { isValid: true, reason: 'Password is strong.' };
}