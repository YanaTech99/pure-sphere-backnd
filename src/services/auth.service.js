import { randomBytes } from "crypto";
import redis from "../config/redis.js";

if (redis) await redis.connect();

const EXPIRY = 5 * 60;

export const createRegistrationToken = async (phone) => {
    const token = randomBytes(32).toString("hex");
    await redis.set(`reg:${token}`, phone, "EX", EXPIRY);
    console.log("Created token:", token, "for phone:", phone);
    return token;
};

export const validateRegistrationToken = async (token) => {
    const key = `reg:${token}`;
    const phone = await redis.get(key);
    console.log("Validating token:", token, "=>", phone);
    return phone; 
};


export const deleteRegistrationToken = async (token) => {
    await redis.del(`reg:${token}`);
};
