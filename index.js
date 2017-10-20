import angular from "angular";

import HomeCtrl from "./homeCtrl";
import currencyInputDirective from "./currencyInputDirective";
import styles from "./home.sass";

angular.module("p2c.home", [])
  .controller("HomeCtrl", HomeCtrl)
  .directive("currencyInput", currencyInputDirective);
