
export const getPaginationParams = (req, options = {}) => {
  const {
    defaultPage = 1,
    defaultLimit = 10,
    maxLimit = 100
  } = options;

  const page = Math.max(1, parseInt(req.query.page) || defaultPage);
  const limit = Math.min(
    maxLimit,
    Math.max(1, parseInt(req.query.limit) || defaultLimit)
  );
  const offset = (page - 1) * limit;

  return { page, limit, offset };
};

export const buildPaginatedResponse = (data, total, { page, limit }) => {
  const totalPages = Math.ceil(total / limit);
  
  return {
    data,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: total,
      itemsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    }
  };
};