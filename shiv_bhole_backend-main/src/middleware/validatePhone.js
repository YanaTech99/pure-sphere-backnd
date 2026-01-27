export const validatePhone = (req, res, next) => {
    const { phone } = req.body;

    if (!phone)
        return res.status(400).json({ success: false, message: "Phone required" });

    if (!/^\d{10}$/.test(phone)) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid 10-digit phone number"
        });
    }

    next();
};
