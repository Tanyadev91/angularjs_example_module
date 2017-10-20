import _ from "lodash";
import methodDialogTemplate from "../dialogs/method.pug";

/* @ngInject */
export default class HomeCtrl {
  constructor(
    $scope,
    $rootScope,
    $state,
    $stateParams,
    $log,
    Statistics,
    Utils,
    country,
    countries,
    Modal,
    TradeService,
    appconfig,
    $translate,
    Country,
    PaymentMethodsResource,
    globalTimer,
    $interval,
    PaymentLimits
  ) {

    // only allow sell or buy
    let newParams, refCountry;
    $scope.action = $stateParams.action;
    if (!["sell", "buy"].includes($scope.action)) {
      newParams = { action: "sell" };
      $state.go("home", _.assign($stateParams, newParams), { notify: false, location: 'replace' });
    }

    // only allow numeric amount
    if (isNaN(parseFloat($stateParams.amount))) {
      newParams = { amount: 0.1 };
      $state.go("home", _.assign($stateParams, newParams), { notify: false, location: 'replace' });
    }

    if ($stateParams.currency) {
      refCountry = Country.getCountryFromCurrency($stateParams.currency);
    } else {
      refCountry = country;
    }

    $scope.swapped = $stateParams.swapped;
    $scope.totalTraded = (Statistics.buy_offer != null ? Statistics.buy_offer.BTC : undefined) + (Statistics.sell_offer != null ? Statistics.sell_offer.BTC : undefined);
    $scope.countries = countries;
    $scope.methods = [];
    $scope.loading = false;
    $scope.model = {
      rate: 1,
      crypto: appconfig.cryptos.BTC,
      method: undefined,
      country: refCountry,
      isCrypto: $scope.action === "sell",
      isExact: false,
      amountGive: undefined,
      amountGet: undefined,
      offerModel: undefined
    };

    $scope.filters =
      {currency: appconfig.genericCurrencies};
    $scope.paymentLimits = PaymentLimits;

    const getMethods = function(amount) {
      if (!amount) { return; }
      $scope.tradesLoading = true;
      $log.debug(`[HomeCtrl::getMethods]amount:${amount}, isCrypto: ${$scope.model.isCrypto}`);
      const params = {
        amount,
        country: $scope.model.country.country_code,
        currency: $scope.model.crypto.id,
        source: $scope.action === "sell" ? "buyers" : "sellers"
      };

      if ($scope.model.isExact) { params.exact = true; }

      return PaymentMethodsResource.query(params).$promise
      .then(function(methods) {
        $scope.methods = formatMethods(methods);
        $scope.displayMethods = _.map(methods, e => ({ name: e["name"], price: e["treshold_price"] }));
        return selectBestMethod();}).catch((err) => {
        $scope.model.method = undefined;
        return Utils.errorHandler(err);}).finally(() => $scope.tradesLoading = false);
    };

    const getPrecision = function() {
      const { offerModel } = $scope.model;
      const isBTC =
        (($scope.action === "buy") && (offerModel === "amountGet")) ||
        (($scope.action === "sell") && (offerModel === "amountGive"));
      const precision = isBTC ? 4 : 2;
      return precision;
    };

    const formatMethods = function(methods) {
      if (!methods.length) { return; }
      const { isCrypto } = $scope.model;
      const precision = getPrecision();
      const isDescending = ($scope.action === 'sell');

      let sorted = _.sortBy(methods, "treshold_price");
      if (isDescending) { sorted = sorted.reverse(); }
      const sanitized = sorted.map(function(method) {
        method.treshold_price = Utils.fixFloat(method.treshold_price, precision);
        return method;
      });
      return sanitized;
    };

    const selectBestMethod = function() {
      let needle;
      if ($scope.model.method && (needle = $scope.model.method, Array.from(_.map($scope.methods, "label")).includes(needle))) {
        const selected = _.find($scope.methods, {label: $scope.model.method});
        $scope.model.method = selected.label;
        return $scope.model[$scope.model.offerModel] = selected.treshold_price;
      } else {
        $scope.model.method = $scope.methods[0].label;
        return $scope.model[$scope.model.offerModel] = $scope.methods[0].treshold_price;
      }
    };

    $scope.onMethodChange = function() {
      $log.debug(`[HomeCtrl::onMethodChange] method: ${$scope.model.method}`);
      const selected = _.find($scope.methods, {label: $scope.model.method});
      return $scope.model[$scope.model.offerModel] = selected.treshold_price;
    };

    $scope.setGive = function() {
      $scope.model.offerModel = "amountGet";
      $scope.model.isExact = $scope.action === "buy";
      return getMethods($scope.model.amountGive);
    };

    $scope.setGet = function() {
      $scope.model.offerModel = "amountGive";
      $scope.model.isExact = $scope.action === "sell";
      return getMethods($scope.model.amountGet);
    };

    $scope.swap = function() {
      $scope.swapped = !$scope.swapped;
      newParams = $scope.action === "sell" ?{
        action: "buy",
        amount: $scope.model.amountGive
      }
      :{
        action: "sell",
        amount: $scope.model.amountGet
      };

      newParams.swapped = $scope.swapped;
      return $state.go("home", _.assign($stateParams, newParams));
    };

    $scope.selectFilterCurrency = function(code) {
      const newCountry = _.find(countries, {country_code: code});
      return $scope.model.country = newCountry;
    };

    $scope.countryQuerySearch = function(queryText){
      if (!$scope.countries) { return []; }
      return _.filter($scope.countries, country=> country.name.toLowerCase().indexOf(queryText.toLowerCase()) === 0);
    };

    $scope.proceed = function(method) {
      Modal.scope.tradesLoading = true;

      return TradeService
      .setAction($scope.action)
      .getTradeResource()
      .save({ voucher: method.voucher }).$promise
      .then(function(offer) {
        $scope.offer = offer;
        globalTimer.start(appconfig.OFFER_VALIDITY);
        $scope.$emit("modal:close");
        $scope.doNotWarn = true;

        $scope.offer.processType = $scope.model.isCrypto ? "approx" : "exact";

        const nextView = $scope.action === "buy" ? "detail-buy" : "detail";
        return $state.transitionTo(nextView, {
          offer: $scope.offer,
          method: _.find($scope.methods, {label: method.label})
        });
      })
      .catch(function(e) {
        $scope.$emit("modal:close");
        if (((e.data != null ? e.data.error : undefined) != null) && [422008,  422010].includes(e.data.error.code)) {
          return Utils.showRetry();
        } else {
          return Utils.showFailed();
        }
      })
      .finally(() => Modal.scope.tradesLoading = false);
    };

    $scope.openMethod = function() {
      const method = _.find($scope.methods, {label: $scope.model.method});
      if (!method) {
        return;
      }
      const model = {
        name: method.name,
        label: method.label,
        description: method[`${$scope.action}_description`],
        eta: method.processing_time,
        currency_fiat: $scope.model.country.currency_code,
        currency_crypto: $scope.model.crypto.id,
        currency: $scope.action === 'buy' ? $scope.model.crypto.id : $scope.model.country.currency_code,
        voucher: method.voucher,
        amount: $scope.model.amountGet,
        precision: getPrecision(),
        security_precision_crypto: 4,
        security_precision_fiat: 2,
        method_type: $scope.action === 'buy' ? $translate.instant('home.Get') : $translate.instant('home.Receive'),
        security_amount_crypto: method.security_crypto_amount
      };

      if ($scope.action === 'buy') {
        model.security_amount_fiat = ($scope.model.amountGive * method.security_crypto_amount) / $scope.model.amountGet;
      } else {
        model.security_amount_fiat = ($scope.model.amountGet * method.security_crypto_amount) / $scope.model.amountGive;
      }

      if (method.security_deposit_is_required) {
        model.security_amount_crypto = 0.05 * $scope.model.amountGet;
        model.security_amount_fiat = 0.05 * $scope.model.amountGive;
      }

      return Modal.show(methodDialogTemplate, { model, doProceed: $scope.proceed}, {});
    };

    $scope.offersInterval = $interval(function() {
      $log.debug("[HomeCtrl::$interval] offersInterval, reloading offers");
      $scope.$emit("modal:close");
      const inputModel = $scope.model.offerModel === "amountGet" ? "amountGive" : "amountGet";
      return getMethods($scope.model[inputModel]);
    }, appconfig.VOUCHER_VALIDITY * 1000);

    $scope.$watch("model.country", function(val) {
      if (!val) { return; }
      $rootScope.modelRef.country = val;
      newParams = { currency: val.currency_code.toLowerCase() };
      return $state.go("home", _.assign($stateParams, newParams));
    });

    $scope.$on("$destroy", function() {
      $log.debug("[HomeCtrl::$on] $destroy");
      return $interval.cancel($scope.offersInterval);
    });

    $scope.$on("error:422008", function() {
      $log.debug("[HomeCtrl::$on] error:422008, reloading offers");
      $scope.$emit("modal:close");
      const inputModel = $scope.model.offerModel === "amountGet" ? "amountGive" : "amountGet";
      return getMethods($scope.model[inputModel]);
    });

    const init = function() {
      if ($scope.action === "sell") {
        $scope.model.offerModel = "amountGet";
        $scope.model.amountGive = parseFloat($stateParams.amount);
        return getMethods($scope.model.amountGive);
      } else {
        $scope.model.offerModel = "amountGive";
        $scope.model.amountGet = parseFloat($stateParams.amount);
        return getMethods($scope.model.amountGet);
      }
    };

    init();
  }
}
