
export const formatPhone = (phone) => {
  if (!phone) return phone;

  if (phone.startsWith("+91-")) return phone;

  return `+91-${phone}`;
};
