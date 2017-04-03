'use strict';

const numeral = require('numeral');

module.exports = {
    enhanceSchema,
    enhanceModel
};

function enhanceSchema(schema, options) {
    if (options.source === undefined) {
        options.source = 'title';
    }

    if (options.disallow === undefined) {

        // Everything except letters and digits becomes a dash. All modern browsers are
        // fine with UTF8 characters in URLs. If you don't like this, pass your own regexp
        // to match disallowed characters
        options.disallow = /[^\w\d]+/g;
    }

    if (options.substitute === undefined) {
        options.substitute = '-';
    }

    if (!options.addSlugManually) {
        schema.add({
            slug: {
                type: String,
                unique: true
            }
        });
    }

    // "Wait, how does the slug become unique?" See enhanceModel below. We add digits to it
    // if and only if there is an actual error on save. This approach is concurrency safe
    // unlike the usual "hope nobody else makes a slug while we're still saving" strategy
    schema.pre('save', function (next) {
        const self = this;

        if (self.get('slug') === undefined) {

            // Come up with a unique slug, even if the title is not unique
            let originalSlug = self.get(options.source);
            originalSlug = originalSlug
                .toLowerCase()
                .replace(options.disallow, options.substitute);

            // Lop off leading and trailing -
            if (originalSlug.length) {
                if (originalSlug.substr(0, 1) === options.substitute) {
                    originalSlug = originalSlug.substr(1);
                }

                if (originalSlug.substr(originalSlug.length - 1, 1) === options.substitute) {
                    originalSlug = originalSlug.substr(0, originalSlug.length - 1);
                }
            }

            self.set('slug', originalSlug);
        }

        next();
    });
};

function enhanceModel(model) {

    // Stash the original 'save' method so we can call it
    model.prototype.originalSave = model.prototype.save;

    // Replace 'save' with a wrapper
    model.prototype.save = function (cb) {
        const self = this;

        // Call the original save method, with our wrapper callback
        self.originalSave(extendSlugOnUniqueIndexError);

        // Our replacement callback
        function extendSlugOnUniqueIndexError(err, doc) {
            if (err) {

                // Spots unique index errors relating to the slug field
                if ((err.code === 11000) && (err.errmsg.indexOf('slug') !== -1)) {
                    let numeriSuffix = (Math.floor(Math.random() * 1000));
                    numeriSuffix = numeral(numeriSuffix).format('000');

                    self.slug += `-${numeriSuffix}`;
                    
                    self.save(extendSlugOnUniqueIndexError);

                    return;
                }
            }

            // Not our special case so call the original callback
            cb(err, doc);
        };
    }
};
