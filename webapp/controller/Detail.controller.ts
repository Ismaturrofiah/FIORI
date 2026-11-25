/* eslint-disable camelcase */
import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import RoutingHistory from "sap/ui/core/routing/History";
import UIComponent from "sap/ui/core/UIComponent";
import UI5Event from "sap/ui/base/Event";
import MessageToast from "sap/m/MessageToast";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import formatter from "../model/formatter";

export interface PRDetailItemData {
    PurchaseRequisition?: string;
    PurchaseRequisitionItem?: string;
    p_banfn?: string;
    p_bnfpo?: string;
    PurchaseReqnCreationDate?: Date | string | null;
    Material?: string;
    PurchaseRequisitionItemText?: string;
    Plant?: string;
    PurchasingGroup?: string;
    PRQuantity?: string | number;
    PRUnit?: string;
    PurchaseRequisitionPrice?: string | number;
    PurReqnItemCurrency?: string;
    PurchaseOrder?: string;
    POQuantity?: string | number;
    POUnit?: string;
    NetAmount?: string | number;
    DocumentCurrency?: string;
    GRDocument?: string;
    GRQuantity?: string | number;
    GRUnit?: string;
    IRDocument?: string;
    PurchaseOrderAmount?: string | number;
    Currency?: string;
    PostingDate?: Date | string | null;
    PaymentStatus?: string;
    DayOpen?: number | string;
    IsClosed?: string;
    IsCompletelyDelivered?: string;
}

/**
 * @namespace prpayment.projectprpayment.controller
 */
export default class Detail extends Controller {
    public formatter = formatter;
    private _bRequestFailedAttached = false;

    public onInit(): void {
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
        this.getView()?.setModel(oViewModel, "detailViewModel");

        const oDetailModel = new JSONModel();
        this.getView()?.setModel(oDetailModel, "detailModel");

        const oRouter = UIComponent.getRouterFor(this) || (this.getOwnerComponent() as UIComponent)?.getRouter();
        if (oRouter) {
            oRouter.getRoute("RouteDetail")?.attachPatternMatched((oEvent: UI5Event) => {
                this._onRouteMatched(oEvent);
            });
        }
    }

    private _isMatch(item: PRDetailItemData | undefined, sPR: string, sItem: string): boolean {
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
    }

    private _onRouteMatched(oEvent: UI5Event): void {
        const mParameters = (oEvent.getParameters() as {
            arguments?: {
                PurchaseRequisition?: string;
                PurchaseRequisitionItem?: string;
            };
        }) || {};
        const oArgs = mParameters.arguments || {};

        const sPR = String(oArgs.PurchaseRequisition || "").trim();
        const sItem = String(oArgs.PurchaseRequisitionItem || "").trim();

        const oViewModel = this.getView()?.getModel("detailViewModel") as JSONModel | undefined;
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

        const oDetailModel = this.getView()?.getModel("detailModel") as JSONModel | undefined;
        let bDataFound = false;

        // 1. Check selectedPR model (immediate transfer from row click in View1)
        const oOwner = this.getOwnerComponent();
        const oSelectedPRModel = oOwner?.getModel("selectedPR") as JSONModel | undefined;
        const oCachedData = oSelectedPRModel?.getData() as PRDetailItemData | undefined;

        if (this._isMatch(oCachedData, sPR, sItem)) {
            if (oDetailModel) {
                oDetailModel.setData({
                    ...oCachedData,
                    p_banfn: sPR,
                    p_bnfpo: sItem
                });
            }
            bDataFound = true;
            if (oViewModel) {
                oViewModel.setProperty("/statusInfo", `Menampilkan data Purchase Requisition ${sPR} (Item ${sItem})`);
            }
        }

        // 2. Check allPRRecords model on component (fallback if page reloaded)
        if (!bDataFound) {
            const oAllPRModel = oOwner?.getModel("allPRRecords") as JSONModel | undefined;
            const aAllRecords = (oAllPRModel?.getData() as PRDetailItemData[]) || [];
            const oFound = aAllRecords.find((rec) => this._isMatch(rec, sPR, sItem));
            if (oFound) {
                if (oDetailModel) {
                    oDetailModel.setData({
                        ...oFound,
                        p_banfn: sPR,
                        p_bnfpo: sItem
                    });
                }
                bDataFound = true;
                if (oViewModel) {
                    oViewModel.setProperty("/statusInfo", `Menampilkan data Purchase Requisition ${sPR} (Item ${sItem})`);
                }
            }
        }

        // 3. Query CDS OData Service Z_PRDETAIL_CDS (with parameters p_banfn, p_bnfpo)
        this._loadPRDetail(sPR, sItem, bDataFound);
    }

    /**
     * Reads Purchase Requisition detail using CDS OData service Z_PRDETAIL_CDS
     * Matches parameters: p_banfn & p_bnfpo from the clicked table line
     */
    private _loadPRDetail(sPR: string, sItem: string, bHasInitialData: boolean): void {
        const oPrDetailModel = (this.getOwnerComponent()?.getModel("prDetail") ||
                                this.getOwnerComponent()?.getModel("Z_PRDETAIL_CDS")) as ODataModel | undefined;
        const oViewModel = this.getView()?.getModel("detailViewModel") as JSONModel | undefined;

        if (!bHasInitialData && oViewModel) {
            oViewModel.setProperty("/busy", true);
        }

        const fnApplyData = (record: PRDetailItemData, bFromCds = false) => {
            const oDetailModel = this.getView()?.getModel("detailModel") as JSONModel | undefined;
            if (oDetailModel) {
                oDetailModel.setData({
                    ...record,
                    p_banfn: sPR,
                    p_bnfpo: sItem
                });
            }
            if (oViewModel) {
                oViewModel.setProperty("/busy", false);
                oViewModel.setProperty("/hasError", false);
                oViewModel.setProperty("/errorMessage", "");
                oViewModel.setProperty("/isCdsActive", bFromCds);
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
            const oMainModel = (this.getOwnerComponent()?.getModel() ||
                                this.getView()?.getModel()) as ODataModel | undefined;
            if (oMainModel && typeof oMainModel.read === "function") {
                const aFilters = [
                    new Filter("PurchaseRequisition", FilterOperator.EQ, sPR)
                ];
                oMainModel.read("/Z_PRtoPayment", {
                    filters: aFilters,
                    success: (oData: unknown) => {
                        const dataObj = oData as { results?: PRDetailItemData[] };
                        const aResults = dataObj.results || [];
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
            oPrDetailModel.attachRequestFailed((oEvt: UI5Event) => {
                const mEvtParams = oEvt.getParameters() as { response?: { statusCode?: number } };
                if (mEvtParams.response && (mEvtParams.response.statusCode === 404 || mEvtParams.response.statusCode === 401)) {
                    // Suppressed: Handled gracefully in Detail controller fallback
                }
            });
            this._bRequestFailedAttached = true;
        }

        const sItemPadded = sItem.padStart(5, "0");

        // Strategy 2: Query EntitySet Z_PRDETAIL_CDSSet with filters
        const fnTryFilterSet = () => {
            const aFilters = [
                new Filter("PurchaseRequisition", FilterOperator.EQ, sPR)
            ];

            oPrDetailModel.read("/Z_PRDETAIL_CDSSet", {
                filters: aFilters,
                success: (oData: unknown) => {
                    const dataObj = oData as { results?: PRDetailItemData[] };
                    const aResults = dataObj.results || [];
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
            success: (oData: unknown) => {
                const dataObj = oData as { results?: PRDetailItemData[] } | PRDetailItemData[];
                let aResults: PRDetailItemData[] = [];
                if (Array.isArray(dataObj)) {
                    aResults = dataObj;
                } else if (dataObj && Array.isArray(dataObj.results)) {
                    aResults = dataObj.results;
                } else if (dataObj && typeof dataObj === "object") {
                    aResults = [dataObj as PRDetailItemData];
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
    }

    public onRefresh(): void {
        const oViewModel = this.getView()?.getModel("detailViewModel") as JSONModel | undefined;
        if (!oViewModel) {
            return;
        }
        const sPR = oViewModel.getProperty("/prNumber") as string;
        const sItem = oViewModel.getProperty("/prItem") as string;
        oViewModel.setProperty("/busy", true);
        this._loadPRDetail(sPR, sItem, false);
        MessageToast.show(`Memuat ulang detail PR ${sPR} (Item ${sItem})...`);
    }

    public onNavBack(): void {
        const oHistory = RoutingHistory.getInstance();
        const sPreviousHash = oHistory.getPreviousHash();

        if (sPreviousHash !== undefined) {
            window.history.go(-1);
        } else {
            const oRouter = UIComponent.getRouterFor(this) || (this.getOwnerComponent() as UIComponent)?.getRouter();
            if (oRouter) {
                oRouter.navTo("RouteView1", {}, true);
            }
        }
    }
}
