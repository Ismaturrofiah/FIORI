sap.ui.define([
    "sap/ui/core/library",
    "sap/ui/core/format/DateFormat",
    "sap/ui/core/format/NumberFormat"
], function (coreLibrary, DateFormat, NumberFormat) {
    "use strict";

    var ValueState = coreLibrary.ValueState;

    return {
        /**
         * Determines the ValueState for a given payment status
         * @param {string} [status] payment status
         * @returns {sap.ui.core.ValueState} value state
         */
        statusState: function (status) {
            if (!status) {
                return ValueState.None;
            }
            var s = status.toUpperCase().trim();
            if (s.includes("PAID") || s === "LUNAS") {
                return ValueState.Success;
            }
            if (s.includes("OVERDUE") || s === "JATUH TEMPO") {
                return ValueState.Error;
            }
            if (s.includes("PARTIAL") || s === "SEBAGIAN") {
                return ValueState.Warning;
            }
            if (s.includes("OPEN") || s.includes("PENDING")) {
                return ValueState.Information;
            }
            return ValueState.None;
        },

        /**
         * Returns an icon according to status
         * @param {string} [status] payment status
         * @returns {string} icon URI
         */
        statusIcon: function (status) {
            if (!status) {
                return "sap-icon://hint";
            }
            var s = status.toUpperCase().trim();
            if (s.includes("PAID")) {
                return "sap-icon://sys-enter-2";
            }
            if (s.includes("OVERDUE")) {
                return "sap-icon://alert";
            }
            if (s.includes("PARTIAL")) {
                return "sap-icon://in-progress";
            }
            if (s.includes("PENDING GR")) {
                return "sap-icon://shipping-status";
            }
            if (s.includes("PENDING IR")) {
                return "sap-icon://receipt";
            }
            if (s.includes("OPEN PR")) {
                return "sap-icon://request";
            }
            return "sap-icon://document";
        },

        /**
         * Highlights aging based on number of days open
         * @param {number} [days] number of days open
         * @returns {sap.ui.core.ValueState} value state
         */
        dayOpenState: function (days) {
            if (days === undefined || days === null || days <= 0) {
                return ValueState.None;
            }
            if (days <= 30) {
                return ValueState.Information;
            }
            if (days <= 60) {
                return ValueState.Warning;
            }
            return ValueState.Error;
        },

        /**
         * Formats Date to locale string (e.g. 13/11/2026)
         * @param {Date|string|null} [value] date value
         * @returns {string} formatted date
         */
        formatDate: function (value) {
            if (!value) {
                return "-";
            }
            var date;
            if (value instanceof Date) {
                date = value;
            } else if (typeof value === "string") {
                if (value.includes("/Date(")) {
                    var ts = parseInt(value.replace(/\/Date\((\d+)\)\//, "$1"), 10);
                    date = new Date(ts);
                } else {
                    date = new Date(value);
                }
            } else {
                return "-";
            }

            if (isNaN(date.getTime())) {
                return "-";
            }
            var oDateFormat = DateFormat.getDateInstance({
                pattern: "dd/MM/yyyy"
            });
            return oDateFormat.format(date);
        },

        /**
         * Formats currency amounts with thousands separators
         * @param {string|number|null} [value] amount
         * @param {string} [currency] currency code
         * @returns {string} formatted amount
         */
        formatCurrency: function (value, currency) {
            if (value === null || value === undefined || value === "") {
                return "-";
            }
            var num = typeof value === "string" ? parseFloat(value) : value;
            if (isNaN(num) || num === 0) {
                return "-";
            }
            var oNumberFormat = NumberFormat.getCurrencyInstance({
                groupingEnabled: true,
                groupingSeparator: ".",
                decimalSeparator: ",",
                decimals: 2
            });
            var formatted = oNumberFormat.format(num);
            return currency ? currency + " " + formatted : formatted;
        },

        /**
         * Formats quantity with unit
         * @param {string|number|null} [value] quantity
         * @param {string} [unit] unit of measure
         * @returns {string} formatted quantity
         */
        formatQuantity: function (value, unit) {
            if (value === null || value === undefined || value === "") {
                return "-";
            }
            var num = typeof value === "string" ? parseFloat(value) : value;
            if (isNaN(num) || num === 0) {
                return "-";
            }
            var oNumberFormat = NumberFormat.getFloatInstance({
                groupingEnabled: true,
                groupingSeparator: ".",
                decimalSeparator: ",",
                maxFractionDigits: 3
            });
            var formatted = oNumberFormat.format(num);
            return unit ? formatted + " " + unit : formatted;
        }
    };
});
