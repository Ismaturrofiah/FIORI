/* eslint-disable camelcase */
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/routing/History",
    "sap/ui/core/UIComponent",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "prpayment/projectprpayment/model/formatter",
    "prpayment/projectprpayment/model/StandardPRNavigation"
], function (Controller, JSONModel, History, UIComponent, MessageToast, Filter, FilterOperator, formatter, StandardPRNavigation) {
    "use strict";

    return Controller.extend("prpayment.projectprpayment.controller.Detail", {
        formatter: formatter,

        onInit: function () {
            this._bRequestFailedAttached = false;

            const oViewModel = new JSONModel({
                busy: false,
                prNumber: "",
                prItem: "",
                hasError: false,
                errorMessage: "",
                statusInfo: "",
                cdsServiceUri: "/sap/opu/odata/sap/Z_PRDETAIL_CDS/",
                cdsParamString: "",
                isCdsActive: false
            });
            this.getView().setModel(oViewModel, "detailViewModel");

            const oDetailModel = new JSONModel();
            this.getView().setModel(oDetailModel, "detailModel");

            const oRouter = this._getRouter();
            if (oRouter) {
                const oRoute = oRouter.getRoute("RouteDetail");
                if (oRoute) {
                    oRoute.attachPatternMatched(this._onRouteMatched, this);
                }
            }
        },

        _getRouter: function () {
            const oOwner = this.getOwnerComponent();
            return UIComponent.getRouterFor(this) || (oOwner && oOwner.getRouter());
        },

        _isMatch: function (item, sPR, sItem) {
            if (!item) {
                return false;
            }
            const itemPR = String(item.PurchaseRequisition || item.p_banfn || "").trim();
            const itemPos = String(item.PurchaseRequisitionItem || item.p_bnfpo || "").trim();
            const prClean = sPR.trim();
            const itemClean = sItem.trim();

            const prMatch = itemPR === prClean || itemPR.replace(/^0+/, "") === prClean.replace(/^0+/, "");
            const posMatch = itemPos === itemClean || itemPos.replace(/^0+/, "") === itemClean.replace(/^0+/, "");
            return prMatch && posMatch;
        },

        _onRouteMatched: function (oEvent) {
            const mParameters = oEvent.getParameters() || {};
            const oArgs = mParameters.arguments || {};

            const sPR = String(oArgs.PurchaseRequisition || "").trim();
            const sItem = String(oArgs.PurchaseRequisitionItem || "").trim();

            const oViewModel = this.getView().getModel("detailViewModel");
            if (oViewModel) {
                oViewModel.setProperty("/prNumber", sPR);
                oViewModel.setProperty("/prItem", sItem);
                oViewModel.setProperty("/cdsParamString", `p_banfn='${sPR}', p_bnfpo='${sItem}'`);
                oViewModel.setProperty("/busy", false);
                oViewModel.setProperty("/hasError", false);
                oViewModel.setProperty("/errorMessage", "");
                oViewModel.setProperty("/isCdsActive", false);
                oViewModel.setProperty("/statusInfo", `Memuat data Purchase Requisition ${sPR} (Item ${sItem})...`);
            }

            const oDetailModel = this.getView().getModel("detailModel");
            let bDataFound = false;

            // 1. Check selectedPR model (immediate transfer from row click in View1)
            const oOwner = this.getOwnerComponent();
            const oSelectedPRModel = oOwner && oOwner.getModel("selectedPR");
            const oCachedData = oSelectedPRModel && oSelectedPRModel.getData();

            if (this._isMatch(oCachedData, sPR, sItem)) {
                if (oDetailModel) {
                    oDetailModel.setData(Object.assign({}, oCachedData, {
                        p_banfn: sPR,
                        p_bnfpo: sItem
                    }));
                }
                bDataFound = true;
                if (oViewModel) {
                    oViewModel.setProperty("/statusInfo", `Menampilkan data Purchase Requisition ${sPR} (Item ${sItem})`);
                }
            }

            // 2. Check allPRRecords model on component (fallback if page reloaded)
            if (!bDataFound) {
                const oAllPRModel = oOwner && oOwner.getModel("allPRRecords");
                const aAllRecords = (oAllPRModel && oAllPRModel.getData()) || [];
                const oFound = aAllRecords.find((rec) => this._isMatch(rec, sPR, sItem));
                if (oFound) {
                    if (oDetailModel) {
                        oDetailModel.setData(Object.assign({}, oFound, {
                            p_banfn: sPR,
                            p_bnfpo: sItem
                        }));
                    }
                    bDataFound = true;
                    if (oViewModel) {
                        oViewModel.setProperty("/statusInfo", `Menampilkan data Purchase Requisition ${sPR} (Item ${sItem})`);
                    }
                }
            }

            // 3. Query CDS OData Service Z_PRDETAIL_CDS (with parameters p_banfn, p_bnfpo)
            this._loadPRDetail(sPR, sItem, bDataFound);
        },

        /**
         * Reads Purchase Requisition detail using CDS OData service Z_PRDETAIL_CDS
         * Matches parameters: p_banfn & p_bnfpo from the clicked table line
         * @param {string} sPR Purchase Requisition number
         * @param {string} sItem Purchase Requisition item
         * @param {boolean} bHasInitialData whether data is already displayed
         */
        _loadPRDetail: function (sPR, sItem, bHasInitialData) {
            const oOwner = this.getOwnerComponent();
            const oPrDetailModel = oOwner && (oOwner.getModel("prDetail") || oOwner.getModel("Z_PRDETAIL_CDS"));
            const oViewModel = this.getView().getModel("detailViewModel");

            if (!bHasInitialData && oViewModel) {
                oViewModel.setProperty("/busy", true);
            }

            const fnApplyData = (record, bFromCds) => {
                const oDetailModel = this.getView().getModel("detailModel");
                if (oDetailModel) {
                    oDetailModel.setData(Object.assign({}, record, {
                        p_banfn: sPR,
                        p_bnfpo: sItem
                    }));
                }
                if (oViewModel) {
                    oViewModel.setProperty("/busy", false);
                    oViewModel.setProperty("/hasError", false);
                    oViewModel.setProperty("/errorMessage", "");
                    oViewModel.setProperty("/isCdsActive", !!bFromCds);
                    oViewModel.setProperty(
                        "/statusInfo",
                        bFromCds
                            ? `Data Purchase Requisition ${sPR} (Item ${sItem}) terhubung ke CDS Z_PRDETAIL_CDS`
                            : `Menampilkan data Purchase Requisition ${sPR} (Item ${sItem})`
                    );
                }
            };

            const fnHandleNotFound = () => {
                if (oViewModel) {
                    oViewModel.setProperty("/busy", false);
                    if (!bHasInitialData) {
                        oViewModel.setProperty("/hasError", true);
                        oViewModel.setProperty(
                            "/errorMessage",
                            `Data Purchase Requisition ${sPR} (Item ${sItem}) tidak ditemukan.`
                        );
                    } else {
                        oViewModel.setProperty("/hasError", false);
                        oViewModel.setProperty(
                            "/statusInfo",
                            `Menampilkan data Purchase Requisition ${sPR} (Item ${sItem}) (Parameter CDS: p_banfn='${sPR}', p_bnfpo='${sItem}')`
                        );
                    }
                }
            };

            // Fallback: Read from mainService (/Z_PRtoPayment)
            const fnFallbackMainService = () => {
                const oMainModel = (oOwner && oOwner.getModel()) || this.getView().getModel();
                if (oMainModel && typeof oMainModel.read === "function") {
                    oMainModel.read("/Z_PRtoPayment", {
                        filters: [new Filter("PurchaseRequisition", FilterOperator.EQ, sPR)],
                        success: (oData) => {
                            const aResults = (oData && oData.results) || [];
                            const oFound = aResults.find((rec) => this._isMatch(rec, sPR, sItem));
                            if (oFound) {
                                fnApplyData(oFound, false);
                            } else if (aResults.length > 0) {
                                fnApplyData(aResults[0], false);
                            } else {
                                fnHandleNotFound();
                            }
                        },
                        error: () => {
                            fnHandleNotFound();
                        }
                    });
                } else {
                    fnHandleNotFound();
                }
            };

            if (!oPrDetailModel || typeof oPrDetailModel.read !== "function") {
                if (!bHasInitialData) {
                    fnFallbackMainService();
                } else {
                    fnHandleNotFound();
                }
                return;
            }

            // Attach non-intrusive error handler to prevent blocking UI5 error MessageBox
            if (!this._bRequestFailedAttached && typeof oPrDetailModel.attachRequestFailed === "function") {
                oPrDetailModel.attachRequestFailed(() => {
                    // Suppressed: Handled gracefully in Detail controller fallback
                });
                this._bRequestFailedAttached = true;
            }

            const sItemPadded = sItem.padStart(5, "0");

            // Strategy 2: Query EntitySet Z_PRDETAIL_CDSSet with filters
            const fnTryFilterSet = () => {
                oPrDetailModel.read("/Z_PRDETAIL_CDSSet", {
                    filters: [new Filter("PurchaseRequisition", FilterOperator.EQ, sPR)],
                    success: (oData) => {
                        const aResults = (oData && oData.results) || [];
                        const oFound = aResults.find((rec) => this._isMatch(rec, sPR, sItem));
                        if (oFound) {
                            fnApplyData(oFound, true);
                        } else if (aResults.length > 0) {
                            fnApplyData(aResults[0], true);
                        } else if (!bHasInitialData) {
                            fnFallbackMainService();
                        } else {
                            fnHandleNotFound();
                        }
                    },
                    error: () => {
                        if (!bHasInitialData) {
                            fnFallbackMainService();
                        } else {
                            fnHandleNotFound();
                        }
                    }
                });
            };

            // Strategy 1: Parameterized CDS path: /Z_PRDETAIL_CDS(p_banfn='...',p_bnfpo='...')/Set
            const sParamPath = `/Z_PRDETAIL_CDS(p_banfn='${sPR}',p_bnfpo='${sItemPadded}')/Set`;

            oPrDetailModel.read(sParamPath, {
                success: (oData) => {
                    let aResults = [];
                    if (Array.isArray(oData)) {
                        aResults = oData;
                    } else if (oData && Array.isArray(oData.results)) {
                        aResults = oData.results;
                    } else if (oData && typeof oData === "object") {
                        aResults = [oData];
                    }

                    if (aResults.length > 0) {
                        fnApplyData(aResults[0], true);
                    } else {
                        fnTryFilterSet();
                    }
                },
                error: () => {
                    fnTryFilterSet();
                }
            });
        },

        onRefresh: function () {
            const oViewModel = this.getView().getModel("detailViewModel");
            if (!oViewModel) {
                return;
            }
            const sPR = oViewModel.getProperty("/prNumber");
            const sItem = oViewModel.getProperty("/prItem");
            oViewModel.setProperty("/busy", true);
            this._loadPRDetail(sPR, sItem, false);
            MessageToast.show(`Memuat ulang detail PR ${sPR} (Item ${sItem})...`);
        },

        /**
         * Opens the PR item in the standard Fiori app "Manage Purchase Requisitions" in a new browser tab
         */
        onOpenStandardPR: function () {
            const oViewModel = this.getView().getModel("detailViewModel");
            const oDetailModel = this.getView().getModel("detailModel");
            StandardPRNavigation.openInNewTab(
                this.getOwnerComponent(),
                (oDetailModel && oDetailModel.getProperty("/PurchaseRequisition")) || oViewModel.getProperty("/prNumber"),
                (oDetailModel && oDetailModel.getProperty("/PurchaseRequisitionItem")) || oViewModel.getProperty("/prItem")
            );
        },

        onNavBack: function () {
            const sPreviousHash = History.getInstance().getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                const oRouter = this._getRouter();
                if (oRouter) {
                    oRouter.navTo("RouteView1", {}, true);
                }
            }
        }
    });
});
