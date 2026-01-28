export const validateProfileUpdate = (req, res, next) => {
    const { phone, gender, alternate_phone, email, pincode } = req.body;

    if (phone) {
        return res.status(400).json({
            success: false,
            message: "Phone number cannot be updated"
        });
    }

    if (gender && !['MALE', 'FEMALE', 'OTHER'].includes(gender)) {
        return res.status(400).json({
            success: false,
            message: "Gender must be MALE, FEMALE, or OTHER"
        });
    }

    if (alternate_phone && !/^\d{10}$/.test(alternate_phone)) {
        return res.status(400).json({
            success: false,
            message: "Invalid alternate phone number"
        });
    }

    if (email && !isValidEmail(email)) {
        return res.status(400).json({
            success: false,
            message: "Invalid email format"
        });
    }

    if (pincode && !isValidPincode(pincode)) {
        return res.status(400).json({
            success: false,
            message: "Invalid pincode format"
        });
    }

    next();
};

const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

const isValidPincode = (pincode) => {
    return /^\d{6}$/.test(pincode);
};