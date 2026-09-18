'use strict';

const { validationResult } = require('express-validator');
const { badRequest } = require('../utilities/errors');

/** Runs express-validator chains and converts failures into a 400 AppError. */
function validate(chains) {
    return [
        ...chains,
        (req, res, next) => {
            const result = validationResult(req);
            if (result.isEmpty()) return next();
            const details = result.array({ onlyFirstError: true }).map((e) => ({ field: e.path || e.param, message: e.msg }));
            return next(badRequest('VALIDATION_FAILED', 'Request validation failed', details));
        }
    ];
}

module.exports = { validate };
