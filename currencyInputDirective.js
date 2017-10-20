import _ from "lodash";
import template from "./currencyInputDirective.pug";
import styles from "./currencyInputDirective.sass";

/* @ngInject */
export default function currencyInputDirective($rootScope, $log, $q, Utils, appconfig, RatesCalculator) {
  let CurrencyInput;
  return {
    templateUrl: template,
    scope: {
      model: "=",
      country: "=",
      isCrypto: "=",
      keyupListener: "&",
      paymentLimits: "=",
      method: "="
    },
    restrict: "E",
    replace: true,
    controller: (CurrencyInput = class CurrencyInput {
      /* @ngInject */
      constructor($scope, $element, $attrs) {
        this.setListeners = this.setListeners.bind(this);
        this.setWatchers = this.setWatchers.bind(this);
        this.$scope = $scope;
        this.$element = $element;
        this.$attrs = $attrs;
        this.input = this.$element.find("input");
        this.form = this.$scope.amountForm;
        this.userEnteredAmount = undefined;
        this.crypto = appconfig.cryptos.BTC.id;
        this.fiat = (this.$scope.country != null ? this.$scope.country.currency_code : undefined) || appconfig.currencyDefault;

        this.setListeners();
        this.setWatchers();
        this.getLimits();
      }

      setListeners() {
        if (this.$attrs.keyupListener) {
          const isValidKey = code =>
            // numbers line
            (44 <= code && code <= 57) ||
            // numeric keypad
            (96 <= code && code <= 105) ||
            // commas, dots, delete
            [188,190,110,8].includes(code)
          ;

          return this.$element.bind("keyup paste", _.debounce(evt => {
            if (!isValidKey(evt.keyCode)) { return; }
            if (this.form != null ? this.form.$invalid : undefined) { return; }
            return this.$scope.keyupListener();
          }
          , 500)
          );
        }
      }

      setWatchers() {
        const that = this;
        this.$scope.$watch("isCrypto", val => {
          that.$scope.precision = val ? appconfig.precision.crypto : appconfig.precision.fiat;
        });

        this.$scope.$watch('method', (val) => {
          that.getLimits();
        });
      }

      getLimits() {
        const that = this;
        const limitsMethod =  _.find(this.$scope.paymentLimits, { label: this.$scope.method });

        if (!limitsMethod) {
          RatesCalculator.loadLimitsAndAmount(this.$scope.isCrypto, this.crypto, this.fiat, this.$scope.model).then(function(limits) {
              that.$scope.limits = limits;
            });
        } else if (this.$scope.isCrypto) {
          $q.all({
            max: RatesCalculator.fromFiatToCrypto('USD', 'BTC', limitsMethod.max_amount_allowed),
            min: RatesCalculator.fromFiatToCrypto('USD', 'BTC', limitsMethod.min_amount_allowed)
          }).then(function(values) {
              that.$scope.limits = {
                min: parseFloat(values.min.toFixed(2)),
                max: parseFloat(values.max.toFixed(2))
              };
            });
        } else {
          $q.all({
            max: RatesCalculator.fromFiatToFiat('USD', this.fiat, limitsMethod.max_amount_allowed),
            min: RatesCalculator.fromFiatToFiat('USD', this.fiat, limitsMethod.min_amount_allowed)
          }).then( function(values) {
            that.$scope.limits = {
              min: Math.floor(parseFloat(values.min)),
              max: Math.ceil(parseFloat(values.max))
            };
          });
        }
      }


      recheckValidity() {
        __guardMethod__(this.form.amountInputField, "$validate", o => o.$validate());
        return $rootScope.$safeApply();
      }
    })
  };
}


function __guardMethod__(obj, methodName, transform) {
  if (typeof obj !== "undefined" && obj !== null && typeof obj[methodName] === "function") {
    return transform(obj, methodName);
  } else {
    return undefined;
  }
}
