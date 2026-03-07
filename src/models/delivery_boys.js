export default (sequelize, DataTypes) => {
  const DeliveryBoy = sequelize.define("delivery_boys", {
    name: DataTypes.STRING,
    email: DataTypes.STRING,
    mobile: DataTypes.STRING,
    address: DataTypes.TEXT,
    alternate_phone: DataTypes.STRING,
    date_of_birth: DataTypes.DATE,
    gender: DataTypes.STRING,
    notes: DataTypes.TEXT,
    status: DataTypes.STRING,
    profile_image_url: DataTypes.STRING,
    license: DataTypes.STRING,
    vehicle_rc: DataTypes.STRING,
    id_prof: DataTypes.STRING
  });

  return DeliveryBoy;
};