/* eslint-disable camelcase */
sap.ui.define([
    "sap/m/MessageToast",
    "sap/base/Log",
    "sap/base/util/ObjectPath"
], function (MessageToast, Log, ObjectPath) {
    "use strict";

    const OUTBOUND_PATH = "/sap.app/crossNavigation/outbounds/PurchaseRequisitionMaintain";
    const NULL_GUID = "00000000-0000-0000-0000-000000000000";

    /**
     * Builds the Fiori Elements inner-app route to the PR item object page of
     * the standard app "Manage Purchase Requisitions" (#PurchaseRequisition-maintain).
     * @param {string} sPR Purchase Requisition number
     * @param {string} sItem Purchase Requisition item (5 digits, e.g. 00010)
     * @returns {string} app specific route without the leading "&/"
     */
    function buildItemRoute(sPR, sItem) {
        const sHeaderKey = `PurchaseRequisition='${sPR}',DraftUUID=guid'${NULL_GUID}',IsActiveEntity=true`;
        const sItemKey = `PurchaseRequisition='${sPR}',PurchaseRequisitionItem='${sItem}',DraftUUID=guid'${NULL_GUID}',IsActiveEntity=true`;
        return `C_PurchaseReqnHeader(${sHeaderKey})/to_PurchaseReqnItem(${sItemKey})/`;
    }

    /**
     * Checks whether the intent can be launched by the current user.
     * Uses the "Navigation" service (UI5 >= 1.120) and falls back to the
     * "CrossApplicationNavigation" service on older launchpads (e.g. S/4HANA on-premise FLP).
     * @returns {Promise<boolean>} resolves with true when the target is navigable
     */
    function checkNavigable(Container, sSemanticObject, sAction, oParams, oComponent) {
        const oTarget = {
            target: { semanticObject: sSemanticObject, action: sAction },
            params: oParams
        };

        return Container.getServiceAsync("Navigation")
            .then((oNavigation) => oNavigation.isNavigable([oTarget], oComponent))
            .catch((oNavError) => {
                Log.warning("Service 'Navigation' tidak tersedia, fallback ke 'CrossApplicationNavigation'",
                    oNavError && (oNavError.message || String(oNavError)),
                    "prpayment.projectprpayment.model.StandardPRNavigation");
                return Container.getServiceAsync("CrossApplicationNavigation")
                    // isNavigationSupported returns a jQuery promise on older releases; wrap it in a native Promise
                    .then((oCrossAppNav) => new Promise((resolve, reject) => {
                        oCrossAppNav.isNavigationSupported([oTarget], oComponent).then(resolve, reject);
                    }))
                    .then((aResult) => [!!(aResult && aResult[0] && aResult[0].supported)]);
            })
            .then((aNavigable) => !!(aNavigable && aNavigable[0]));
    }

    return {
        /**
         * Opens the PR item in the standard Fiori app "Manage Purchase Requisitions" in a new browser tab.
         * Only works when the app runs inside the SAP Fiori launchpad.
         * @param {sap.ui.core.UIComponent} oComponent owner component
         * @param {string} sPurchaseRequisition Purchase Requisition number
         * @param {string} [sPurchaseRequisitionItem] Purchase Requisition item
         */
        openInNewTab: function (oComponent, sPurchaseRequisition, sPurchaseRequisitionItem) {
            const sPR = String(sPurchaseRequisition || "").trim();
            const sItemRaw = String(sPurchaseRequisitionItem || "").trim();

            if (!sPR) {
                MessageToast.show("Nomor Purchase Requisition tidak tersedia.");
                return;
            }

            // sap/ushell/Container only exists when the app runs inside the Fiori launchpad
            // (older launchpads expose it only as global sap.ushell.Container)
            const Container = sap.ui.require("sap/ushell/Container") || ObjectPath.get("sap.ushell.Container");
            if (!Container) {
                MessageToast.show("Aplikasi standard Manage Purchase Requisitions hanya bisa dibuka dari Fiori Launchpad.");
                return;
            }

            const oOutbound = (oComponent && oComponent.getManifestEntry(OUTBOUND_PATH)) || {};
            const sSemanticObject = oOutbound.semanticObject || "PurchaseRequisition";
            const sAction = oOutbound.action || "maintain";
            const sIntent = `${sSemanticObject}-${sAction}`;

            const oParams = { PurchaseRequisition: sPR };
            let sAppSpecificRoute;
            if (sItemRaw) {
                const sItem = sItemRaw.padStart(5, "0");
                oParams.PurchaseRequisitionItem = sItem;
                sAppSpecificRoute = buildItemRoute(sPR, sItem);
            }

            // Shell hash in the same format the standard app F2229 uses, e.g.
            // #PurchaseRequisition-maintain?PurchaseRequisition=..&PurchaseRequisitionItem=..&/C_PurchaseReqnHeader(..)/to_PurchaseReqnItem(..)/
            const sQuery = Object.keys(oParams)
                .map((sKey) => `${encodeURIComponent(sKey)}=${encodeURIComponent(oParams[sKey])}`)
                .join("&");
            const sHash = `#${sIntent}?${sQuery}${sAppSpecificRoute ? "&/" + sAppSpecificRoute : ""}`;
            const sUrl = window.location.href.split("#")[0] + sHash;

            // Open the tab synchronously (inside the click) so the browser does not block it as a popup;
            // the URL is filled in once the launchpad has confirmed the target is available.
            const oNewWindow = window.open("", "_blank");
            if (!oNewWindow) {
                MessageToast.show("Tab baru diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi.");
                return;
            }
            oNewWindow.opener = null;

            const fnFail = (sMessage) => {
                oNewWindow.close();
                MessageToast.show(sMessage);
            };

            checkNavigable(Container, sSemanticObject, sAction, oParams, oComponent)
                .then((bNavigable) => {
                    if (!bNavigable) {
                        fnFail(`Aplikasi standard Manage Purchase Requisitions (${sIntent}) tidak tersedia atau user tidak punya otorisasi.`);
                        return;
                    }
                    oNewWindow.location.href = sUrl;
                })
                .catch((oError) => {
                    Log.error("Navigasi ke aplikasi standard gagal", oError && (oError.stack || oError.message || String(oError)),
                        "prpayment.projectprpayment.model.StandardPRNavigation");
                    fnFail(`Gagal membuka aplikasi standard Manage Purchase Requisitions (${sIntent}).`);
                });
        }
    };
});
