import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const AUTH_TOKEN = process.env.MESSAGECENTRAL_TOKEN ||
 "eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJDLTBERUQzNTREMDMyQTQ3OSIsImlhdCI6MTc2MzQ1NjA0NiwiZXhwIjoxOTIxMTM2MDQ2fQ.BBRpQD9gGtBgzeb-iw_1gxmDuuO0aEykQ61y7W2WMCZ_db08ytQOs17CAzEwxFUDGgC89-URvy0rO7YwmGADAA";
const CUSTOMER_ID = "C-0DED354D032A479";

export const sendOtp = async (phone) => {
    const cleanPhone = phone.replace(/\D/g, "");

    return axios.post(
        "https://cpaas.messagecentral.com/verification/v3/send",
        null,
        {
            params: {
                countryCode: 91,
                customerId: CUSTOMER_ID,
                flowType: "SMS",
                mobileNumber: cleanPhone,
            },
            headers: {
                authToken: AUTH_TOKEN,
                "Content-Type": "application/x-www-form-urlencoded",
            },
        }
    );
};

export const verifyOtp = async (phone, otp, verificationId) => {
    const cleanPhone = phone.replace(/\D/g, "");

    return axios.get(
        "https://cpaas.messagecentral.com/verification/v3/validateOtp",
        {
            params: {
                countryCode: 91,
                mobileNumber: cleanPhone,
                verificationId,
                customerId: CUSTOMER_ID,
                code: otp,
            },
            headers: {
                authToken: AUTH_TOKEN,
            },
        }
    );
};
