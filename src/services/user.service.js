import Admin from "../models/User.js";
import { formatPhone } from "../utils/formatPhonenum.js";

export const findUserByPhone = async (phone) => {
  const formatted = formatPhone(phone);
  if (!formatted) return null;  
  return await Admin.findOne({ where: { phone: formatted } });
};

export const findbyEmail = (email) => {
    return Admin.findOne({ where: { email } });
};


export const createUser = (phone, password_hash , agent = false) => {
    return Admin.create({
        phone,
        password_hash,
        role_id: agent ? 0 : 3,
        user_type: agent ? "agent" : "customer",
        is_verified : agent ? 0 : 1
    });
};

