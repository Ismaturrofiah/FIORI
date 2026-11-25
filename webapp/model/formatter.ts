import { ValueState } from "sap/ui/core/library";
import DateFormat from "sap/ui/core/format/DateFormat";
import NumberFormat from "sap/ui/core/format/NumberFormat";

export default {
    /**
     * Determines the ValueState for a given payment status
     */
    statusState(status?: string): ValueState {
        if (!status) {
            return ValueState.None;
        }
        const s = status.toUpperCase().trim();
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
     */
    statusIcon(status?: string): string {
        if (!status) {
            return "sap-icon://hint";
        }
        const s = status.toUpperCase().trim();
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
     */
    dayOpenState(days?: number): ValueState {
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
     */
    formatDate(value?: Date | string | null): string {
        if (!value) {
            return "-";
        }
        let date: Date;
        if (value instanceof Date) {
            date = value;
        } else if (typeof value === "string") {
            if (value.includes("/Date(")) {
                const ts = parseInt(value.replace(/\/Date\((\d+)\)\//, "$1"), 10);
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
        const oDateFormat = DateFormat.getDateInstance({
            pattern: "dd/MM/yyyy"
        });
        return oDateFormat.format(date);
    },

    /**
     * Formats currency amounts with thousands separators
     */
    formatCurrency(value?: string | number | null, currency?: string): string {
        if (value === null || value === undefined || value === "") {
            return "-";
        }
        const num = typeof value === "string" ? parseFloat(value) : value;
        if (isNaN(num) || num === 0) {
            return "-";
        }
        const oNumberFormat = NumberFormat.getCurrencyInstance({
            groupingEnabled: true,
            groupingSeparator: ".",
            decimalSeparator: ",",
            decimals: 2
        });
        const formatted = oNumberFormat.format(num);
        return currency ? `${currency} ${formatted}` : formatted;
    },

    /**
     * Formats quantity with unit
     */
    formatQuantity(value?: string | number | null, unit?: string): string {
        if (value === null || value === undefined || value === "") {
            return "-";
        }
        const num = typeof value === "string" ? parseFloat(value) : value;
        if (isNaN(num) || num === 0) {
            return "-";
        }
        const oNumberFormat = NumberFormat.getFloatInstance({
            groupingEnabled: true,
            groupingSeparator: ".",
            decimalSeparator: ",",
            maxFractionDigits: 3
        });
        const formatted = oNumberFormat.format(num);
        return unit ? `${formatted} ${unit}` : formatted;
    }
};
