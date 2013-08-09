var cc = {};

(function(){

    'use strict';

    /**
     * Creates the given namespace within the cc namespace.
     * The method returns an object that contains meta data
     *
     * - targetParent (object)
     * - targetName (string)
     * - bind (function) : a convenient function to bind
                           a value to the namespace
     * 
     * Options:
     * 
     *   - `namespaceString` e.g. 'cc.services.FooService'
     * 
     */

    cc.namespace = function (namespaceString) {
        var parts = namespaceString.split('.'), parent = cc, i;

        //strip redundant leading global
        if (parts[0] === 'cc') {
            parts = parts.slice(1);
        }

        var targetParent = cc,
            targetName;

        for (i = 0; i < parts.length; i++) {
            //create a propery if it doesn't exist
            if (typeof parent[parts[i]] === "undefined") {
                parent[parts[i]] = {};
            }

            if (i === parts.length - 2){
                targetParent = parent[parts[i]];
            }

            targetName = parts[i];

            parent = parent[parts[i]];
        }
        return {
            targetParent: targetParent,
            targetName: targetName,
            bind: function(target){
                targetParent[targetName] = target;
            }
        };
    };

    cc.define = function(namespace, fn){
        cc.namespace(namespace)
          .bind(fn);
    };

    /**
     * Sets up an inheritance chain between two objects
     * https://github.com/isaacs/inherits/blob/master/inherits.js
     * Can be used like this:
     *
     *   function Child () {
     *    Child.super.call(this)
     *    console.error([this
     *                  ,this.constructor
     *                  ,this.constructor === Child
     *                  ,this.constructor.super === Parent
     *                  ,Object.getPrototypeOf(this) === Child.prototype
     *                  ,Object.getPrototypeOf(Object.getPrototypeOf(this))
     *                   === Parent.prototype
     *                  ,this instanceof Child
     *                  ,this instanceof Parent])
     *  }
     *  function Parent () {}
     *  inherits(Child, Parent)
     *  new Child
     *
     */

     /*jshint asi: true*/
    cc.inherits = function (c, p, proto) {
        //this code uses a shitty form of semicolon less
        //writing. We just copied it from:
        //https://github.com/isaacs/inherits/blob/master/inherits.js

        proto = proto || {}
        var e = {}
        ;[c.prototype, proto].forEach(function (s) {
            Object.getOwnPropertyNames(s).forEach(function (k) {
                e[k] = Object.getOwnPropertyDescriptor(s, k)
            })
        })
        c.prototype = Object.create(p.prototype, e)
        c.super = p
    };
    /*jshint asi: false*/

})();






cc.Array = {
    remove: function(arr, item){
            var index = arr.indexOf(item);
            arr.splice(index, 1);
            return arr;
        }
};
cc.define('cc.BasketService', function(storageService, options){

    'use strict';

    var self = {},
        storePrefix = 'basketService_',
        storeItemsName = storePrefix + 'items',
        items = sanitizeSavedData(storageService.get(storeItemsName)) || [],
        productIdentityFn = options && cc.Util.isFunction(options.productIdentityFn) ? 
            options.productIdentityFn : function(productA, productAVariant, productAOptionId,
                                                 productB, productBVariant, productBOptionId){

                return productA.id === productB.id &&
                       productAVariant === productBVariant &&
                       productAOptionId === productBOptionId;
            };

    
    //allow this service to raise events
    cc.observable.mixin(self);

    //http://mutablethought.com/2013/04/25/angular-js-ng-repeat-no-longer-allowing-duplicates/
    function sanitizeSavedData(data){
        if (!data){
            return data;
        }

        return data.map(function(val){
            delete val.$$hashKey;

            //on serialization all functions go away. That means, we basically
            //have to create a fresh instance again, once we deserialize again
            var item = cc.Util.deepExtend(new cc.models.BasketItem(), val);

            if (item.product){
                item.product = cc.Util.deepExtend(new cc.models.Product(), item.product);
            }

            return item;
        });
    }

    var writeToStore = function(){
        storageService.set(storeItemsName, items);
    };

    writeToStore();

    /**
     * Adds an item to the basket. Returns the added 'BasketItem' 
     * 
     * Options:
     * 
     *   - `product` the Product object itself
     *   - `quantity` the number of times the product should be added
     *   - `variant` the variant the product should be added with
     *   - `optionId` the optionId the product should be added with
     */
    self.addItem = function(product, quantity, variant, optionId){
        var basketItem = self.find(createProductPredicate(product, variant, optionId)),
            exists = !cc.Util.isUndefined(basketItem);

        if (!exists){
            basketItem = new cc.models.BasketItem();
            items.push(basketItem);
        }

        basketItem.product = product;
        basketItem.quantity = basketItem.quantity + quantity;
        basketItem.variant = variant;
        basketItem.optionId = optionId;

        writeToStore();

        self.emit('itemAdded', self, basketItem);

        return basketItem;
    };

    /**
     * A shorthand for:
     * basketService.increase(basketItem, 1) 
     * 
     * Options:
     * 
     *   - `basketItem` the basketItem that should be increased by one
     */
    self.increaseOne = function(basketItem){
        return self.increase(basketItem, 1);
    };

    /**
     * A shorthand for:
     * basketService.addItem(basketItem.product, number, basketItem.variant, basketItem.optionId) 
     * 
     * Options:
     * 
     *   - `basketItem` the basketItem that should be increased by one
     */
    self.increase = function(basketItem, number){
        return self.addItem(basketItem.product, number, basketItem.variant, basketItem.optionId);
    };

    /**
     * Checks if an product exists in the basket 
     * 
     * Options:
     * 
     *   - `product` the Product object itself
     *   - `variant` the variant the basket should be checked for
     *   - `optionId` the optionId the basket should be checked for
     */
    self.exists = function(product, variant, optionId){
        var basketItem = self.find(createProductPredicate(product, variant, optionId));
            return !cc.Util.isUndefined(basketItem);
    };

    var createProductPredicate = function(productA, productAVariant, productAOptionId){
        return function(item){
            return productIdentityFn(productA, productAVariant, productAOptionId,
                                     item.product, item.variant, item.optionId);
        };
    };

    /**
     * Removes an item from the basket 
     * 
     * Options:
     * 
     *   - `product` the Product that should be removed from the basket
     *   - `quantity` the quantity that should be removed from the basket
     *   - `variant` the variant that should be removed from the basket
     *   - `optionId` the optionId that should be removed from the basket
     */
    self.removeItem = function(product, quantity, variant, optionId){
        var basketItem = self.find(createProductPredicate(product, variant, optionId));

        if (!basketItem){
            throw new Error('Product id: ' + product.id + 
                ' , variant: ' + variant + 
                ', optionId: ' + optionId + 
                '  does not exist in the basket');
        }

        if(basketItem.quantity < quantity){
            throw new Error('remove quantity is higher than existing quantity');
        }

        basketItem.quantity = basketItem.quantity - quantity;

        if (basketItem.quantity === 0){
            cc.Array.remove(items, basketItem);
        }

        writeToStore();

        self.emit('itemRemoved', self, basketItem);

        return basketItem;
    };

    /**
     * A shorthand for:
     * basketService.decrease(basketItem, 1) 
     * 
     * Options:
     * 
     *   - `basketItem` the basketItem that should be decreased by one
     */
    self.decreaseOne = function(basketItem){
        return self.decrease(basketItem, 1);
    };

    /**
     * A shorthand for:
     * basketService.removeItem(basketItem.product, number, basketItem.variant, basketItem.optionId) 
     * 
     * Options:
     * 
     *   - `basketItem` the basketItem that should be decreased by one
     */
    self.decrease = function(basketItem, number){
        return self.removeItem(basketItem.product, number, basketItem.variant, basketItem.optionId);
    };

    /**
     * Removes all items from the basket 
     * 
     * Options:
     * 
     */
    self.clear = function(){
        
        items.length = 0;

        writeToStore();

        self.emit('cleared', self);

        //return self for chaining
        return self;
    };

    /**
     * Finds a basket item by the given predicate function 
     * 
     * Options:
     * 
     *   - `predicate` function to test the basketItem against
     */

    self.find = function(predicate){
        return cc.Util.find(items, predicate);
    };


    /**
     * Returns all basket items 
     * 
     */

    self.getItems = function(){
        return items;
    };

    /**
     * Returns a summary object of the current basket state 
     * 
     */

    self.getSummary = function(){
        var shipping            = cc.Config.shippingCost,
            shippingTax         = cc.Config.shippingTax,
            freeShippingFrom    = cc.Config.freeShippingFrom,
            quantity            = 0,
            sum                 = 0,
            vat                 = 0,
            discount            = 0,
            total               = 0;

        items.forEach(function(item){
            var itemQuantity = parseInt(item.quantity, 10);
            var product = item.product;
            //attention this doesn't take variants into account yet!
            var price = product.price;
            var tax = parseInt(product.tax, 10);
            quantity += itemQuantity;
            sum += price * itemQuantity;
            vat += parseFloat(Math.round((price * tax / (100 + tax) ) * 100) / 100) * itemQuantity;
        });

        //set the shipping to zero if the sum is above the configured free shipping value
        shipping = freeShippingFrom !== null && freeShippingFrom !== undefined && sum >= freeShippingFrom ? 0 : shipping;

        total = sum + shipping + discount;

        vat += parseFloat(Math.round((shipping * shippingTax / (100 + shippingTax) ) * 100) / 100);

        var summary = {
            quantity: quantity,
            sum: sum,
            sumStr: sum.toFixed(2),
            vat: vat,
            vatStr: vat.toFixed(2),
            shipping: shipping,
            shippingStr: shipping.toFixed(2),
            discount: discount,
            total: total,
            totalStr: total.toFixed(2),
            shippingTax: shippingTax
        };

        return summary;
    };

    return self;
});
cc.define('cc.comparer.ProductComparer', function(tree, childNodeProperty){

    'use strict';

    return function(a, b){

        //either compare products by object identity, urlKey identity or id identity
        return  a === b || 
                a.urlKey && b.urlKey && a.urlKey === b.urlKey ||
                a.id && b.id && a.id === b.id;
    };
});
cc.Config = {
    storeId: 88399,
    apiUrl: 'http://cc1.couchcommerce.com/apiv6/products/',
    apiHttpMethod: 'jsonp',
    categoryJson: '../data/dasgibtesnureinmal/categories.json',
    //apiUrl: 'data/dasgibtesnureinmal/products.json',
    //apiHttpMethod: 'get',
    mediaFolder:'http://cc1.couchcommerce.com/media/dasgibtesnureinmal/img/',
    mediaImgExtension:'png',
    mediaPlaceholder:'http://cdn.couchcommerce.com/media/platzhalter.png',
    resourceUrl:'http://localhost:8888/couchcommerce/couchcommerce-frontend/app/data/pages/',
    shippingCost:5,
    shippingTax:19,
    shippingFreeFrom: null,
    currencySign:'EUR',
    shippingText:'zzgl. 5€ Versandkosten',
    aboutPages:[
            {
                title:'Neptune',
                id:'neptune'
            },
            {
                title:'Saturn',
                id:'saturn'
            }
    ]
};
cc.define('cc.CouchService', function($http, $q){

    'use strict';

    var self = {},
        products = {},
        currentCategory = null,
        productComparer = new cc.comparer.ProductComparer();


    /**
     * Fetches the category with the given categoryUrlId
     * If no category is specified, the method
     * defaults to the root category 
     * 
     * Options:
     * 
     *   - `categoryUrlId` the category to be fetched
     * 
     */
    self.getCategory = function(category){
        if (!category && !self.categories){
            return fetchAllCategories();
        }
        else if(!category && self.categories){
            var deferredCategories = $q.defer();
            deferredCategories.resolve(self.categories);
            return deferredCategories.promise;
        }
        else if(category && category.length > 0 && !self.categories){
            return fetchAllCategories()
                    .then(function(data){
                        return findChildCategory(data, category);
                    });
        }
        else if(category && category.length > 0 && self.categories){
            return findChildCategoriesAndReturnPromise(self.categories, category);
        }
    };

    /**
     * Fetches all products of a given category
     * 
     * Options:
     * 
     *   - `categoryUrlId` the urlId of the category to fetch the products from
     * 
     */
    self.getProducts = function(categoryUrlId){

        if(!products[categoryUrlId]){
            return $http({
                method: cc.Config.apiHttpMethod,
                url: cc.Config.apiUrl +
                '?&stid=' +
                cc.Config.storeId +
                '&cat=' + categoryUrlId +
                '&callback=JSON_CALLBACK'
            })
            .then(function(data){
                var tempProducts = augmentProducts(data.data.products, categoryUrlId);
                //FixMe we are effectively creating a memory leak here by caching all
                //seen products forever. This needs to be more sophisticated
                products[categoryUrlId] = tempProducts;
                return tempProducts;
            });
        }

        var deferredProducts = $q.defer();
        deferredProducts.resolve(products[categoryUrlId]);
        return deferredProducts.promise;
    };

    var resolveWith = function(data){
        var deferred = $q.defer();
        deferred.resolve(data);
        return deferred.promise;
    };

    //it's a bit akward that we need to do that. It should be adressed
    //directly on our server API so that this extra processing can be removed.
    var augmentProducts = function(products, categoryUrlId){
        return products.map(function(product){
            product.categoryUrlId = categoryUrlId;
            return cc.Util.deepExtend(new cc.models.Product(), product);
        });
    };

    /**
     * Fetches the next product within the product's category
     * 
     * Options:
     * 
     *   - `product` the product to find the neighbour of
     * 
     */
    self.getNextProduct = function(product, circle){
        
        var getTargetProduct = function(categoryProducts){
            var index = getIndexOfProduct(categoryProducts, product);
            if (index > -1){
                var nextProduct = categoryProducts[index + 1];
                var targetProduct = !nextProduct && circle ?
                                    categoryProducts[0] : nextProduct || null;

                return targetProduct;
            }
        };

        return getPreviousOrNextProduct(product, circle, getTargetProduct);
    };

    /**
     * Fetches the previous product within the product's category
     * 
     * Options:
     * 
     *   - `product` the product to find the neighbour of
     * 
     */
    self.getPreviousProduct = function(product, circle){

        var getTargetProduct = function(categoryProducts, baseProduct){
            var index = getIndexOfProduct(categoryProducts, baseProduct);
            if (index > -1){
                var previousProduct = categoryProducts[index - 1];
                var targetProduct = !previousProduct && circle ? 
                                    categoryProducts[categoryProducts.length - 1] : 
                                    previousProduct || null;

                return targetProduct;
            }
        };

        return getPreviousOrNextProduct(product, circle, getTargetProduct);
    };

    var getPreviousOrNextProduct = function(product, circle, productFindFn){
        var cachedProducts = products[product.categoryUrlId];

        if (cachedProducts){
            return resolveWith(productFindFn(cachedProducts, product));
        }
        else {
            return  self.getProducts(product.categoryUrlId)
                        .then(function(catProducts){
                            return resolveWith(productFindFn(catProducts, product));
                        });
        }
    };

    var getIndexOfProduct = function(productTable, product){
        for (var i = 0; i < productTable.length; i++) {
            if (productComparer(productTable[i], product)){
                return i;
            }
        }

        return -1;
    };


    /**
     * Fetches a single product.
     * Notice that both the `categoryUrlId` and the `productUrlId` need
     * to be specified in order to get the product.
     * 
     * Options:
     * 
     *   - `categoryUrlId` the urlId of the category the product belongs to
     *   - `productUrlId` the urlId of the product itself
     * 
     */
    self.getProduct = function(categoryUrlId, productUrlId){
        if(!products[categoryUrlId]){
            return  self.getProducts(categoryUrlId)
                        .then(function(data){
                            return getProduct(data, productUrlId);
                        });
        }

        var deferredProduct = $q.defer();
        deferredProduct.resolve(getProduct(products[categoryUrlId], productUrlId));
        return deferredProduct.promise;
    };

    var getProduct = function(products, productUrlId){
        for (var i = 0; i < products.length; i++) {
            var product = products[i];
            if (product.urlKey === productUrlId){
                return product;
            }
        }

        return null;
    };

    self.getCurrentCategory = function(){
        return currentCategory;
    };

    var fetchAllCategories = function(){
        return $http({
            method: 'get',
            url: cc.Config.categoryJson
        })  
        .then(function(data){
            self.categories = data.data;
            augmentCategories(self.categories);
            currentCategory = self.categories;
            return data.data;
        });
    };

    var augmentCategories = function(categories){
        //we need to fix the urlId for the rootCategory to be empty
        categories.urlId = '';
        var iterator = new cc.util.TreeIterator(categories, 'children');
        iterator.iterateChildren(function(category, parent){
            category.parent = parent;
            category.image = cc.Config.mediaFolder + category.urlId + "." + cc.Config.mediaImgExtension;
        });
    };

    var findChildCategoriesAndReturnPromise = function(data, rootCategory){
        var childCategory = findChildCategory(data, rootCategory);
        var deferred = $q.defer();
        deferred.resolve(childCategory);
        return deferred.promise;
    };

    var findChildCategory = function(rootCategory, urlId){
        var iterator = new cc.util.TreeIterator(rootCategory, 'children');
        var matchedCategory;

        iterator.iterateChildren(function(category){
            if(category.urlId === urlId){
                matchedCategory = category;
                return false;
            }
        });

        currentCategory = matchedCategory;

        return matchedCategory;
    };

    return self;
});
cc.define('cc.DeviceService', function($window){
    var self = {};

    var ua = navigator.userAgent,
        uaindex;

    // determine OS
    if ( ua.match(/iPad/i) || ua.match(/iPhone/i) ){
        userOS = 'iOS';
        uaindex = ua.indexOf( 'OS ' );
    }
    else if ( ua.match(/Android/i) ){
        userOS = 'Android';
        uaindex = ua.indexOf( 'Android ' );
    }
    else{
        userOS = 'unknown';
    }

    // determine version
    if ( userOS === 'iOS'  &&  uaindex > -1 ){
        userOSver = ua.substr( uaindex + 3, 3 ).replace( '_', '.' );
    }
    else if ( userOS === 'Android'  &&  uaindex > -1 ){
        userOSver = ua.substr( uaindex + 8, 3 );
    }
    else {
        userOSver = 'unknown';
    }

    self.isTabletSize = function(){
        //http://stackoverflow.com/questions/6370690/media-queries-how-to-target-desktop-tablet-and-mobile
        return $window.screen.width > 641;
    };

    self.getOs = function(){
        return userOS;
    };

    self.getOsVersion = function(){
        return userOSver;
    };

    self.hasPositionFixedSupport = function(){
        //We know, brother sniffing is bad, but for fixed toolbars, there
        //is no easy solution.
        //http://bradfrostweb.com/blog/mobile/fixed-position/

        var version = self.getOsVersion();

        var versionStartsWith = function(str){
            return version.indexOf(str) === 0;
        };

        if (self.getOs() === 'Android'){
            //versions < 2.3 of Android have poor fixed support
            if (versionStartsWith('2')){
                if (versionStartsWith('2.2') || versionStartsWith('2.1') || versionStartsWith('2.0')){
                    return false;
                }
                else{
                    return true;
                }
            }
            //make all other versions except 1.x return true
            return !versionStartsWith(1);
        }
        else if (self.getOs() === 'iOS'){
            return  !versionStartsWith('1') &&
                    !versionStartsWith('2') &&
                    !versionStartsWith('3') &&
                    !versionStartsWith('4');
        }
    };

    return self;
});
//This code can probably be improved.
//it's probably unefficient since it doesn't screen level by level
//instead it goes deep down all levels of each categories and then hops
//over to the next category.
cc.define('cc.util.TreeIterator', function(tree, childNodeProperty){

    'use strict';

    var me = this,
        continueIteration = true;

    me.iterateChildren = function(fn){
        continueIteration = true;
        return _iterateChildren(tree, fn);
    };

    var _iterateChildren = function(rootCategory, fn, parent){
        continueIteration = fn(rootCategory, parent);

        if (rootCategory[childNodeProperty] && continueIteration !== false){
            rootCategory[childNodeProperty].forEach(function(category){
                if (continueIteration !== false){
                    _iterateChildren(category, fn, rootCategory);
                }
            });
        }
    };
});
cc.define('cc.MemoryStorageService', function(){
    
    var _storage = {};

    var set = function(id, data){
        _storage[id] = data;
    };

    var get = function(id){
        return _storage[id];
    };

    var remove = function(id){
        delete _storage[id];
    };

    return {
        set: set,
        get: get,
        remove: remove
    };
});
cc.define('cc.models.BasketItem', function(){

    'use strict';

    var self = this;

    self.quantity = 0;

    return self;
});

cc.models.BasketItem.prototype.getTotal = function(){
    return cc.Util.round(this.quantity * this.product.price, 2);
};
cc.define('cc.models.Product', function(){});

cc.models.Product.prototype.getImage = function(size){
    for (var i = 0; i < this.images.length; i++) {
        if (this.images[i].sizeName.toLowerCase() === size){
            return this.images[i].url;
        }
    }

    return cc.Config.mediaPlaceholder;
};

cc.models.Product.prototype.getAllImages = function(){

    if (!this._allImages){
        this._allImages = [{ url: this.getImage('large') }].concat(this.imagesAlt);
    }

    return this._allImages;
};

//TODO: This is pure shit. I need to talk to Felix got get that clean
//It's only in here to keep some German clients happy that rely on it.
//We need to make it more flexibile & localizable
cc.models.Product.prototype.getBasePriceInfo = function(){
    if (this.custom1 > 0){
        if (this.custom3 === 'kg'){
            return 'entspricht ' + cc.Util.toFixed(this.custom1, 2) + ' € pro 1 Kilogramm (kg)';
        }
        else if (this.custom3 === 'St'){
            return 'entpricht ' + cc.Util.toFixed(this.custom1, 2) + ' € pro 1 Stück (St)';
        }
        else if (this.custom3 === 'L'){
            return 'entpricht ' + cc.Util.toFixed(this.custom1, 2) + ' € pro 1 Liter (l)';
        }
        else if (cc.Util.isString(this.custom3) && this.custom3.length > 0){
            return 'entpricht ' + cc.Util.toFixed(this.custom1, 2) + ' € pro ' + this.custom3;
        }
    }

    return '';
};

cc.models.Product.prototype.hasVariants = function(){
    return this.variants && this.variants.length > 0;
};
cc.define('cc.Observable', function(){

    'use strict';

    var self = {
        mixin: function(obj, handlers) {
            // we store the list of handlers as a local variable inside the scope
            // so that we don't have to add random properties to the object we are
            // converting. (prefixing variables in the object with an underscore or
            // two is an ugly solution)
            //      we declare the variable in the function definition to use two less
            //      characters (as opposed to using 'var ').  I consider this an inelegant
            //      solution since smokesignals.convert.length now returns 2 when it is
            //      really 1, but doing this doesn't otherwise change the functionallity of
            //      this module, so we'll go with it for now
            handlers = {};

            // add a listener
            obj.on = function(eventName, handler) {
                // either use the existing array or create a new one for this event
                //      this isn't the most efficient way to do this, but is the shorter
                //      than other more efficient ways, so we'll go with it for now.
                (handlers[eventName] = handlers[eventName] || [])
                    // add the handler to the array
                    .push(handler);

                return obj;
            }

            // add a listener that will only be called once
            obj.once = function(eventName, handler) {
                // create a wrapper listener, that will remove itself after it is called
                function wrappedHandler() {
                    // remove ourself, and then call the real handler with the args
                    // passed to this wrapper
                    handler.apply(obj.off(eventName, wrappedHandler), arguments);
                }
                // in order to allow that these wrapped handlers can be removed by
                // removing the original function, we save a reference to the original
                // function
                wrappedHandler.h = handler;

                // call the regular add listener function with our new wrapper
                return obj.on(eventName, wrappedHandler);
            }

            // remove a listener
            obj.off = function(eventName, handler) {
                // loop through all handlers for this eventName, assuming a handler
                // was passed in, to see if the handler passed in was any of them so
                // we can remove it
                //      it would be more efficient to stash the length and compare i
                //      to that, but that is longer so we'll go with this.
                for (var list = handlers[eventName], i = 0; handler && list && list[i]; i++) {
                    // either this item is the handler passed in, or this item is a
                    // wrapper for the handler passed in.  See the 'once' function
                    list[i] != handler && list[i].h != handler ||
                        // remove it!
                    list.splice(i--,1);
                }
                // if i is 0 (i.e. falsy), then there are no items in the array for this
                // event name (or the array doesn't exist)
                if (!i) {
                    // remove the array for this eventname (if it doesn't exist then
                    // this isn't really hurting anything)
                    delete handlers[eventName];
                }
                return obj;
            }

            obj.emit = function(eventName) {
                // loop through all handlers for this event name and call them all
                //      it would be more efficient to stash the length and compare i
                //      to that, but that is longer so we'll go with this.
                for(var list = handlers[eventName], i = 0; list && list[i];) {
                    list[i++].apply(obj, list.slice.call(arguments, 1));
                }
                return obj;
            }

            return obj;
        }
    };

    return self;
});

cc.observable = new cc.Observable();
cc.define('cc.PagesService', function($http, $q){

    'use strict';

    var self = {};

    self.getPage = function(id){
        return $http
                .get(cc.Config.resourceUrl + id + '.html')
                .then(function(result){
                    if (result.data){

                        //we don't want to directly alter the page config, so we create a copy
                        var pageConfig = cc.Util.deepExtend({}, self.getPageConfig(id));

                        pageConfig.content = result.data;

                        return pageConfig;
                    }
                });
    };

    self.getPageConfig = function(id){
        var page = cc.Config.aboutPages.filter(function(page){
            return page.id === id;
        });

        return page.length > 0 && page[0];
    };

    return self;
});
cc.define('cc.QService', function(){

    'use strict';

    function qFactory(nextTick, exceptionHandler) {

      /**
       * @ngdoc
       * @name ng.$q#defer
       * @methodOf ng.$q
       * @description
       * Creates a `Deferred` object which represents a task which will finish in the future.
       *
       * @returns {Deferred} Returns a new instance of deferred.
       */
      var defer = function() {
        var pending = [],
            value, deferred;

        deferred = {

          resolve: function(val) {
            if (pending) {
              var callbacks = pending;
              pending = undefined;
              value = ref(val);

              if (callbacks.length) {
                nextTick(function() {
                  var callback;
                  for (var i = 0, ii = callbacks.length; i < ii; i++) {
                    callback = callbacks[i];
                    value.then(callback[0], callback[1]);
                  }
                });
              }
            }
          },


          reject: function(reason) {
            deferred.resolve(reject(reason));
          },


          promise: {
            then: function(callback, errback) {
              var result = defer();

              var wrappedCallback = function(value) {
                try {
                  result.resolve((callback || defaultCallback)(value));
                } catch(e) {
                  exceptionHandler(e);
                  result.reject(e);
                }
              };

              var wrappedErrback = function(reason) {
                try {
                  result.resolve((errback || defaultErrback)(reason));
                } catch(e) {
                  exceptionHandler(e);
                  result.reject(e);
                }
              };

              if (pending) {
                pending.push([wrappedCallback, wrappedErrback]);
              } else {
                value.then(wrappedCallback, wrappedErrback);
              }

              return result.promise;
            },
            always: function(callback) {
              
              function makePromise(value, resolved) {
                var result = defer();
                if (resolved) {
                  result.resolve(value);
                } else {
                  result.reject(value);
                }
                return result.promise;
              }
              
              function handleCallback(value, isResolved) {
                var callbackOutput = null;            
                try {
                  callbackOutput = (callback ||defaultCallback)();
                } catch(e) {
                  return makePromise(e, false);
                }            
                if (callbackOutput && callbackOutput.then) {
                  return callbackOutput.then(function() {
                    return makePromise(value, isResolved);
                  }, function(error) {
                    return makePromise(error, false);
                  });
                } else {
                  return makePromise(value, isResolved);
                }
              }
              
              return this.then(function(value) {
                return handleCallback(value, true);
              }, function(error) {
                return handleCallback(error, false);
              });
            }
          }
        };

        return deferred;
      };


      var ref = function(value) {
        if (value && value.then) return value;
        return {
          then: function(callback) {
            var result = defer();
            nextTick(function() {
              result.resolve(callback(value));
            });
            return result.promise;
          }
        };
      };


      /**
       * @ngdoc
       * @name ng.$q#reject
       * @methodOf ng.$q
       * @description
       * Creates a promise that is resolved as rejected with the specified `reason`. This api should be
       * used to forward rejection in a chain of promises. If you are dealing with the last promise in
       * a promise chain, you don't need to worry about it.
       *
       * When comparing deferreds/promises to the familiar behavior of try/catch/throw, think of
       * `reject` as the `throw` keyword in JavaScript. This also means that if you "catch" an error via
       * a promise error callback and you want to forward the error to the promise derived from the
       * current promise, you have to "rethrow" the error by returning a rejection constructed via
       * `reject`.
       *
       * <pre>
       *   promiseB = promiseA.then(function(result) {
       *     // success: do something and resolve promiseB
       *     //          with the old or a new result
       *     return result;
       *   }, function(reason) {
       *     // error: handle the error if possible and
       *     //        resolve promiseB with newPromiseOrValue,
       *     //        otherwise forward the rejection to promiseB
       *     if (canHandle(reason)) {
       *      // handle the error and recover
       *      return newPromiseOrValue;
       *     }
       *     return $q.reject(reason);
       *   });
       * </pre>
       *
       * @param {*} reason Constant, message, exception or an object representing the rejection reason.
       * @returns {Promise} Returns a promise that was already resolved as rejected with the `reason`.
       */
      var reject = function(reason) {
        return {
          then: function(callback, errback) {
            var result = defer();
            nextTick(function() {
              result.resolve((errback || defaultErrback)(reason));
            });
            return result.promise;
          }
        };
      };


      /**
       * @ngdoc
       * @name ng.$q#when
       * @methodOf ng.$q
       * @description
       * Wraps an object that might be a value or a (3rd party) then-able promise into a $q promise.
       * This is useful when you are dealing with an object that might or might not be a promise, or if
       * the promise comes from a source that can't be trusted.
       *
       * @param {*} value Value or a promise
       * @returns {Promise} Returns a promise of the passed value or promise
       */
      var when = function(value, callback, errback) {
        var result = defer(),
            done;

        var wrappedCallback = function(value) {
          try {
            return (callback || defaultCallback)(value);
          } catch (e) {
            exceptionHandler(e);
            return reject(e);
          }
        };

        var wrappedErrback = function(reason) {
          try {
            return (errback || defaultErrback)(reason);
          } catch (e) {
            exceptionHandler(e);
            return reject(e);
          }
        };

        nextTick(function() {
          ref(value).then(function(value) {
            if (done) return;
            done = true;
            result.resolve(ref(value).then(wrappedCallback, wrappedErrback));
          }, function(reason) {
            if (done) return;
            done = true;
            result.resolve(wrappedErrback(reason));
          });
        });

        return result.promise;
      };


      function defaultCallback(value) {
        return value;
      }


      function defaultErrback(reason) {
        return reject(reason);
      }


      /**
       * @ngdoc
       * @name ng.$q#all
       * @methodOf ng.$q
       * @description
       * Combines multiple promises into a single promise that is resolved when all of the input
       * promises are resolved.
       *
       * @param {Array.<Promise>|Object.<Promise>} promises An array or hash of promises.
       * @returns {Promise} Returns a single promise that will be resolved with an array/hash of values,
       *   each value corresponding to the promise at the same index/key in the `promises` array/hash. If any of
       *   the promises is resolved with a rejection, this resulting promise will be resolved with the
       *   same rejection.
       */
      function all(promises) {
        var deferred = defer(),
            counter = 0,
            results = isArray(promises) ? [] : {};

        forEach(promises, function(promise, key) {
          counter++;
          ref(promise).then(function(value) {
            if (results.hasOwnProperty(key)) return;
            results[key] = value;
            if (!(--counter)) deferred.resolve(results);
          }, function(reason) {
            if (results.hasOwnProperty(key)) return;
            deferred.reject(reason);
          });
        });

        if (counter === 0) {
          deferred.resolve(results);
        }

        return deferred.promise;
      }

      return {
        defer: defer,
        reject: reject,
        when: when,
        all: all
      };
    }

    return qFactory(function(fn){
        //This is because this service is an Angular rip off. In Angular they
        //use this hook to trigger the dirty checking. For us it's a noop.
        //We just don't want to change the code too much so that we can maintain
        //compatibility to the Angular $q service easily.
        fn();
    }, function(err){
        //That's the exceptionHandler. For now, just dump all exceptions on the console
        console.log(err);
    });
});
//we just wrap store.js in a service here
cc.define('cc.SessionStorageService', function(){
    return store;
});
cc.Util = {
    //http://docs.sencha.com/touch/2.2.0/source/Number2.html#Ext-Number-method-toFixed
    isToFixedBroken: (0.9).toFixed() !== '1',
    indicatorObject: {},
    //Used to determine if values are of the language type Object
    objectTypes: {
        'boolean': false,
        'function': true,
        'object': true,
        'number': false,
        'string': false,
        'undefined': false
    },
    round: function(value, places){
        var multiplier = Math.pow(10, places);
        return (Math.round(value * multiplier) / multiplier);
    },
    toFixed: function(value, precision){

        value = cc.Util.isString(value) ? parseFloat(value) : value;

        if (cc.Util.isToFixedBroken) {
            precision = precision || 0;
            var pow = Math.pow(10, precision);
            return (Math.round(value * pow) / pow).toFixed(precision);
        }

        return value.toFixed(precision);
    },
    /*jshint eqeqeq:false*/
    deepExtend: function () {
        var target = arguments[0] || {}, i = 1, length = arguments.length, deep = false, options;

        if (target.constructor == Boolean) {
            deep = target;
            target = arguments[1] || {};
            i = 2;
        }

        if (typeof target != "object" && typeof target != "function")
            target = {};

        if (length == 1) {
            target = this;
            i = 0;
        }

        for (; i < length; i++)
            if ((options = arguments[i]) != null)
                for (var name in options) {
                    if (target === options[name])
                        continue;

                    if (deep && options[name] && typeof options[name] == "object" && target[name] && !options[name].nodeType)
                        target[name] = this.deepExtend(true, target[name], options[name]);

                    else if (options[name] != undefined)
                        target[name] = options[name];
                }

        return target;
    },
    /*jshint eqeqeq:true, -:true*/
    //this method is ripped out from lo-dash
    /*jshint eqeqeq:false*/
    createCallback: function(func, thisArg, argCount) {
      if (func === null) {
        return identity;
      }
      var type = typeof func;
      if (type != 'function') {
        if (type != 'object') {
          return function(object) {
            return object[func];
          };
        }
        var props = keys(func);
        return function(object) {
          var length = props.length,
              result = false;
          while (length--) {
            if (!(result = isEqual(object[props[length]], func[props[length]], cc.Util.indicatorObject))) {
              break;
            }
          }
          return result;
        };
      }
      if (typeof thisArg == 'undefined') {
        return func;
      }
      if (argCount === 1) {
        return function(value) {
          return func.call(thisArg, value);
        };
      }
      if (argCount === 2) {
        return function(a, b) {
          return func.call(thisArg, a, b);
        };
      }
      if (argCount === 4) {
        return function(accumulator, value, index, collection) {
          return func.call(thisArg, accumulator, value, index, collection);
        };
      }
      return function(value, index, collection) {
        return func.call(thisArg, value, index, collection);
      };
    },
    /*jshint eqeqeq:true*/
    //this method is ripped out from lo-dash
    findKey: function(object, callback, thisArg) {
      var result;
      callback = cc.Util.createCallback(callback, thisArg);
      cc.Util.forOwn(object, function(value, key, object) {
        if (callback(value, key, object)) {
          result = key;
          return false;
        }
      });
      return result;
    },
    find: function(object, callback, thisArg) {
      var result;
      callback = cc.Util.createCallback(callback, thisArg);
      cc.Util.forOwn(object, function(value, key, object) {
        if (callback(value, key, object)) {
          result = value;
          return false;
        }
      });
      return result;
    },
    //this method is ripped out from lo-dash
    forOwn: function(collection, callback) {
        var index,
            iterable = collection,
            result = iterable;

        if (!iterable) {
            return result;
        }

        if (!cc.Util.objectTypes[typeof iterable]) {
            return result;
        }

        for (index in iterable) {
            if (Object.prototype.hasOwnProperty.call(iterable, index)) {
                if (callback(iterable[index], index, collection) === cc.Util.indicatorObject) {
                    return result;
                }
            }
        }
        return result;
    },
    isArray: function(value){
            return toString.call(value) === '[object Array]';
    },
    isFunction: function(value){
        return typeof value === 'function';
    },
    isString: function(value){
        return typeof  value === 'string';
    },
    isUndefined: function(value){
        return typeof value === 'undefined';
    },
    Array: {
        remove: function(arr, item){
            var index = arr.indexOf(item);
            arr.splice(index, 1);
            return arr;
        }
    }
};
;(function(){
    var store = {},
        win = window,
        doc = win.document,
        localStorageName = 'sessionStorage',
        namespace = '__storejs__',
        storage

    store.disabled = false
    store.set = function(key, value) {}
    store.get = function(key) {}
    store.remove = function(key) {}
    store.clear = function() {}
    store.transact = function(key, defaultVal, transactionFn) {
        var val = store.get(key)
        if (transactionFn == null) {
            transactionFn = defaultVal
            defaultVal = null
        }
        if (typeof val == 'undefined') { val = defaultVal || {} }
        transactionFn(val)
        store.set(key, val)
    }
    store.getAll = function() {}

    store.serialize = function(value) {
        return JSON.stringify(value)
    }
    store.deserialize = function(value) {
        if (typeof value != 'string') { return undefined }
        try { return JSON.parse(value) }
        catch(e) { return value || undefined }
    }

    // Functions to encapsulate questionable FireFox 3.6.13 behavior
    // when about.config::dom.storage.enabled === false
    // See https://github.com/marcuswestin/store.js/issues#issue/13
    function isLocalStorageNameSupported() {
        try { return (localStorageName in win && win[localStorageName]) }
        catch(err) { return false }
    }

    if (isLocalStorageNameSupported()) {
        storage = win[localStorageName]
        store.set = function(key, val) {
            if (val === undefined) { return store.remove(key) }
            storage.setItem(key, store.serialize(val))
            return val
        }
        store.get = function(key) { return store.deserialize(storage.getItem(key)) }
        store.remove = function(key) { storage.removeItem(key) }
        store.clear = function() { storage.clear() }
        store.getAll = function() {
            var ret = {}
            for (var i=0; i<storage.length; ++i) {
                var key = storage.key(i)
                ret[key] = store.get(key)
            }
            return ret
        }
    } else if (doc.documentElement.addBehavior) {
        var storageOwner,
            storageContainer
        // Since #userData storage applies only to specific paths, we need to
        // somehow link our data to a specific path.  We choose /favicon.ico
        // as a pretty safe option, since all browsers already make a request to
        // this URL anyway and being a 404 will not hurt us here.  We wrap an
        // iframe pointing to the favicon in an ActiveXObject(htmlfile) object
        // (see: http://msdn.microsoft.com/en-us/library/aa752574(v=VS.85).aspx)
        // since the iframe access rules appear to allow direct access and
        // manipulation of the document element, even for a 404 page.  This
        // document can be used instead of the current document (which would
        // have been limited to the current path) to perform #userData storage.
        try {
            storageContainer = new ActiveXObject('htmlfile')
            storageContainer.open()
            storageContainer.write('<s' + 'cript>document.w=window</s' + 'cript><iframe src="/favicon.ico"></frame>')
            storageContainer.close()
            storageOwner = storageContainer.w.frames[0].document
            storage = storageOwner.createElement('div')
        } catch(e) {
            // somehow ActiveXObject instantiation failed (perhaps some special
            // security settings or otherwse), fall back to per-path storage
            storage = doc.createElement('div')
            storageOwner = doc.body
        }
        function withIEStorage(storeFunction) {
            return function() {
                var args = Array.prototype.slice.call(arguments, 0)
                args.unshift(storage)
                // See http://msdn.microsoft.com/en-us/library/ms531081(v=VS.85).aspx
                // and http://msdn.microsoft.com/en-us/library/ms531424(v=VS.85).aspx
                storageOwner.appendChild(storage)
                storage.addBehavior('#default#userData')
                storage.load(localStorageName)
                var result = storeFunction.apply(store, args)
                storageOwner.removeChild(storage)
                return result
            }
        }

        // In IE7, keys may not contain special chars. See all of https://github.com/marcuswestin/store.js/issues/40
        var forbiddenCharsRegex = new RegExp("[!\"#$%&'()*+,/\\\\:;<=>?@[\\]^`{|}~]", "g")
        function ieKeyFix(key) {
            return key.replace(forbiddenCharsRegex, '___')
        }
        store.set = withIEStorage(function(storage, key, val) {
            key = ieKeyFix(key)
            if (val === undefined) { return store.remove(key) }
            storage.setAttribute(key, store.serialize(val))
            storage.save(localStorageName)
            return val
        })
        store.get = withIEStorage(function(storage, key) {
            key = ieKeyFix(key)
            return store.deserialize(storage.getAttribute(key))
        })
        store.remove = withIEStorage(function(storage, key) {
            key = ieKeyFix(key)
            storage.removeAttribute(key)
            storage.save(localStorageName)
        })
        store.clear = withIEStorage(function(storage) {
            var attributes = storage.XMLDocument.documentElement.attributes
            storage.load(localStorageName)
            for (var i=0, attr; attr=attributes[i]; i++) {
                storage.removeAttribute(attr.name)
            }
            storage.save(localStorageName)
        })
        store.getAll = withIEStorage(function(storage) {
            var attributes = storage.XMLDocument.documentElement.attributes
            var ret = {}
            for (var i=0, attr; attr=attributes[i]; ++i) {
                var key = ieKeyFix(attr.name)
                ret[attr.name] = store.deserialize(storage.getAttribute(key))
            }
            return ret
        })
    }

    try {
        store.set(namespace, namespace)
        if (store.get(namespace) != namespace) { store.disabled = true }
        store.remove(namespace)
    } catch(e) {
        store.disabled = true
    }
    store.enabled = !store.disabled
    if (typeof module != 'undefined' && module.exports) { module.exports = store }
    else if (typeof define === 'function' && define.amd) { define(store) }
    else { this.store = store }
})();