var async = require('async');
var util = require('util');

module.exports = function(config, redis, logger) {

  return {
    
    repoPut: function (req, res, next) {
      if (!req.params.namespace)
        req.params.namespace = 'library';
        
      if (req.permission != 'admin' && req.permission != 'write') {
        res.send(403, 'access denied');
        return next();
      }

      redis.get(redis.key('images', req.params.namespace, req.params.repo), function(err, value) {
        if (err && err.status != '404') {
          logger.error({err: err, namespace: req.params.namespace, repo: req.params.repo});
          res.send(500, err);
          return next();
        }

        var images = {};
        var tags = {};

        if ((err && err.status == '404') || value == null)
          var value = []
        
        req.original_images = value;

        var data = value.concat(req.body);

        for (var x = 0; x<data.length; x++) {
          var i = data[x];
          var iid = i['id'];

          if (typeof(images[iid]) !== "undefined" && typeof(images[iid]['checksum']) !== "undefined")
            continue;

          i_data = {'id': iid};

          // check if checksum is set
          if (typeof(i['checksum']) !== "undefined") {
            i_data['checksum'] = i['checksum'];
          }

          // check if tag is set
          if (typeof(i['Tag']) !== "undefined") {
            tags[i['Tag']] = iid;
            //i_data['Tag'] = i['Tag'];
          }

          images[iid] = i_data;
        }

        var final_tags = {};
        for (var key in tags) {
          final_tags[tags[key]] = key;
        }

        var final_images = [];
        for (var key in images) {
          // Set the tag on the Image.
          if (typeof(final_tags[key]) !== "undefined") {
            images[key]['Tag'] = final_tags[key];
          }
  
          final_images.push(images[key]);
        }

        redis.set(redis.key('images', req.params.namespace, req.params.repo), final_images, function(err, status) {
          if (err) {
            logger.error({err: err, type: 'redis', namespace: req.params.namespace, repo: req.params.repo});
            res.send(500, err);
            return next();
          }

          async.each(final_images, function(image, cb) {
            var token_key = redis.key('tokens', req.token_auth.token, 'images', image.id);
            redis.set(token_key, 1, function(err, resp) {
              if (err) {
                cb(err);
              }

              // This expiration is merely for if an error occurs
              // we want the token to be invalidated automatically
              redis.expire(token_key, config.tokens.expiration, function(err, resp2) {
                if (err) {
                  cb(err);
                }
                
                cb();
              });
            });
          }, function(err) {
            if (err) {
              res.send(500, "something went wrong");
              return next();
            }
            
            res.send(200);
            return next();
          });
        })
      });
    },
    
    repoDelete: function (req, res, next) {
      if (!req.params.namespace)
        req.params.namespace = 'library';

      if (req.permission != 'admin')
        return res.send(403, 'access denied');
    }
    
    
  } 
}
