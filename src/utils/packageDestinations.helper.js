import sequelize from "../config/db.js";

export const savePackageDestinations = async (
    package_id,
    destinations = [],
    mode = "create"
) => {
    if (!package_id || !Array.isArray(destinations)) return;

    const transaction = await sequelize.transaction();
    try {
        for (const dest of destinations) {
            if (!dest.destination_id) continue;

            if (mode === "create") {

                console.log("create")
                const [existing] = await sequelize.query(
                    `
          SELECT 1
          FROM package_destinations
          WHERE package_id = ? AND destination_id = ?
          LIMIT 1
          `,
                    {
                        replacements: [package_id, dest.destination_id],
                        transaction,
                    }
                );

                if (existing.length > 0) {
                    throw new Error("Destination already assigned to this package");
                }
            }


            await sequelize.query(
                `
       INSERT INTO package_destinations
  (package_id, destination_id, day_number, travel_mode, visit_order)
  VALUES (?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    day_number  = VALUES(day_number),
    travel_mode = VALUES(travel_mode),
    visit_order = VALUES(visit_order)
        `,
                {
                    replacements: [
                        package_id,
                        dest.destination_id,
                        dest.day_number ?? null,
                        dest.travel_mode ?? null,
                        dest.visit_order ?? null,
                    ],
                    transaction,
                }

            );

            console.log("update")
        }

        await transaction.commit();
    } catch (err) {
        await transaction.rollback();
        throw err;
    }
};
