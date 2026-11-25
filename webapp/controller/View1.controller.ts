import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import Fragment from "sap/ui/core/Fragment";
import Dialog from "sap/m/Dialog";
import ViewSettingsDialog from "sap/m/ViewSettingsDialog";
import ViewSettingsItem from "sap/m/ViewSettingsItem";
import MessageToast from "sap/m/MessageToast";
import UIComponent from "sap/ui/core/UIComponent";
import GenericTile from "sap/m/GenericTile";
import SearchField from "sap/m/SearchField";
import Select from "sap/m/Select";
import Button from "sap/m/Button";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import { EdmType } from "sap/ui/export/library";
import UI5Event from "sap/ui/base/Event";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import formatter from "../model/formatter";

interface PRPaymentItemData {
    rowNumber?: number;
    PaymentStatus?: string;
    DayOpen?: number | string;
    PurchaseRequisition?: string;
    PurchaseRequisitionItem?: string;
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
    IsClosed?: string;
    IsCompletelyDelivered?: string;
}

interface PageButtonInfo {
    page: number;
    active: boolean;
}

interface FilterCriteria {
    search: string;
    year: string;
    prFrom?: Date | null;
    prTo?: Date | null;
    plant: string;
    pGroup: string;
    material: string;
    status: string;
    currency: string;
}

/**
 * @namespace prpayment.projectprpayment.controller
 */
export default class View1 extends Controller {
    public formatter = formatter;
    private _pDetailDialog?: Promise<Dialog>;
    private _pViewSettingsDialog?: Promise<ViewSettingsDialog>;

    private _allRecords: PRPaymentItemData[] = [];
    private _filteredRecords: PRPaymentItemData[] = [];
    private _currentYear: number = new Date().getFullYear();

    public onInit(): void {
        const oViewModel = new JSONModel({
            searchQuery: "",
            selectedYear: "CURRENT", // Default: Current Year
            currentYear: this._currentYear,
            currentYearLabel: `Tahun Berjalan (${this._currentYear})`,
            prDateFrom: null as Date | null,
            prDateTo: null as Date | null,
            selectedPlant: "",
            selectedPurchasingGroup: "",
            selectedMaterial: "",
            selectedStatus: "",
            selectedCurrency: "",
            selectedAging: "",
            pageSize: "50", // Default: 50 items per screen
            currentPage: 1,
            totalPages: 1,
            pageStart: 0,
            pageEnd: 0,
            totalCount: 0,
            hasPrev: false,
            hasNext: false,
            pageButtons: [] as PageButtonInfo[],
            // Highlight Summary Counters
            kpiTotal: 0,
            kpiPROpen: 0,
            kpiPOOpen: 0,
            highlightTotalPR: 0,
            highlightPeriodLabel: `Tahun Berjalan (${this._currentYear})`,
            hasActiveFilter: true,
            activeFilterText: `Tahun Transaksi: ${this._currentYear} (Tahun Berjalan)`,
            // Dynamic Dropdown Lists
            yearList: [
                { key: "CURRENT", text: `Tahun Berjalan (${this._currentYear})` },
                { key: "ALL", text: "Semua Tahun" }
            ],
            plantList: [{ key: "", text: "Semua Plant" }],
            purchasingGroupList: [{ key: "", text: "Semua Purchasing Group" }],
            statusList: [{ key: "", text: "Semua Payment Status" }],
            currencyList: [{ key: "", text: "Semua Mata Uang" }]
        });

        this.getView()?.setModel(oViewModel, "viewModel");

        // Model dedicated to holding current paginated items
        const oTableModel = new JSONModel({
            displayedItems: [] as PRPaymentItemData[]
        });
        this.getView()?.setModel(oTableModel, "tableModel");

        // Load data from OData model once initialized
        this._loadDataFromOData();
    }

    /**
     * Reads all data from the CDS OData Service
     */
    private _loadDataFromOData(): void {
        const oModel = (this.getOwnerComponent()?.getModel() || this.getView()?.getModel()) as ODataModel | undefined;
        if (!oModel) {
            return;
        }

        const fnRead = () => {
            oModel.read("/Z_PRtoPayment", {
                success: (oData: unknown) => {
                    const dataObj = oData as { results?: PRPaymentItemData[] };
                    this._allRecords = dataObj.results || [];
                    this.getOwnerComponent()?.setModel(new JSONModel(this._allRecords), "allPRRecords");
                    this._populateFilterDropdowns();
                    this._applyFiltersAndPagination();
                },
                error: () => {
                    MessageToast.show("Gagal memuat data dari CDS OData Service.");
                }
            });
        };

        void oModel.metadataLoaded().then(fnRead).catch(fnRead);
    }

    /**
     * Extracts Date object from Date or OData date string
     */
    private _getRecordDate(dateVal?: Date | string | null): Date | null {
        if (!dateVal) {
            return null;
        }
        if (dateVal instanceof Date) {
            return dateVal;
        }
        if (typeof dateVal === "string") {
            if (dateVal.includes("/Date(")) {
                const ts = parseInt(dateVal.replace(/\/Date\((\d+)\)\//, "$1"), 10);
                if (!isNaN(ts)) {
                    return new Date(ts);
                }
            }
            const parsed = new Date(dateVal);
            if (!isNaN(parsed.getTime())) {
                return parsed;
            }
        }
        return null;
    }

    /**
     * Extracts year number from Date or OData date string
     */
    private _getRecordYear(dateVal?: Date | string | null): number | null {
        const d = this._getRecordDate(dateVal);
        return d ? d.getFullYear() : null;
    }

    /**
     * Populates dynamic filter dropdown lists from the current dataset:
     * - Transaction Year from PR Date
     * - Plant list from table
     * - Purchasing Group list from table
     * - Overall Status list from table
     * - Currency list from table
     */
    private _populateFilterDropdowns(): void {
        const oViewModel = this.getView()?.getModel("viewModel") as JSONModel | undefined;
        if (!oViewModel) {
            return;
        }

        const yearSet = new Set<number>();
        const plantSet = new Set<string>();
        const pGroupSet = new Set<string>();
        const statusSet = new Set<string>();
        const currencySet = new Set<string>();

        this._allRecords.forEach((item) => {
            const nYear = this._getRecordYear(item.PurchaseReqnCreationDate);
            if (nYear) {
                yearSet.add(nYear);
            }
            if (item.Plant) {
                plantSet.add(String(item.Plant).trim());
            }
            if (item.PurchasingGroup) {
                pGroupSet.add(String(item.PurchasingGroup).trim());
            }
            if (item.PaymentStatus) {
                statusSet.add(String(item.PaymentStatus).trim());
            }
            if (item.PurReqnItemCurrency) {
                currencySet.add(String(item.PurReqnItemCurrency).trim());
            }
            if (item.DocumentCurrency) {
                currencySet.add(String(item.DocumentCurrency).trim());
            }
            if (item.Currency) {
                currencySet.add(String(item.Currency).trim());
            }
        });

        const aYears = [
            { key: "CURRENT", text: `Tahun Berjalan (${this._currentYear})` },
            { key: "ALL", text: "Semua Tahun" },
            ...Array.from(yearSet).sort((a, b) => b - a).map((y) => ({ key: String(y), text: String(y) }))
        ];

        const aPlants = [
            { key: "", text: "Semua Plant" },
            ...Array.from(plantSet).sort().map((p) => ({ key: p, text: p }))
        ];

        const aPGroups = [
            { key: "", text: "Semua Purchasing Group" },
            ...Array.from(pGroupSet).sort().map((pg) => ({ key: pg, text: pg }))
        ];

        const aStatuses = [
            { key: "", text: "Semua Payment Status" },
            ...Array.from(statusSet).sort().map((st) => ({ key: st, text: st }))
        ];

        const aCurrencies = [
            { key: "", text: "Semua Mata Uang" },
            ...Array.from(currencySet).sort().map((c) => ({ key: c, text: c }))
        ];

        oViewModel.setProperty("/yearList", aYears);
        oViewModel.setProperty("/plantList", aPlants);
        oViewModel.setProperty("/purchasingGroupList", aPGroups);
        oViewModel.setProperty("/statusList", aStatuses);
        oViewModel.setProperty("/currencyList", aCurrencies);
    }

    /**
     * Filter matcher: Year filter
     */
    private _matchesYear(item: PRPaymentItemData, sYear: string, bHasCustomDateRange: boolean): boolean {
        // If a specific date range is selected, date range takes precedence
        if (bHasCustomDateRange || sYear === "ALL") {
            return true;
        }
        const targetYear = sYear === "CURRENT" ? this._currentYear : parseInt(sYear, 10);
        return this._getRecordYear(item.PurchaseReqnCreationDate) === targetYear;
    }

    /**
     * Filter matcher: PR Creation Date Range
     */
    private _matchesPRDate(item: PRPaymentItemData, dFrom?: Date | null, dTo?: Date | null): boolean {
        if (!dFrom) {
            return true;
        }
        const recDate = this._getRecordDate(item.PurchaseReqnCreationDate);
        if (!recDate) {
            return false;
        }
        const tFrom = new Date(dFrom).setHours(0, 0, 0, 0);
        const recTime = recDate.getTime();
        if (recTime < tFrom) {
            return false;
        }
        if (dTo) {
            const tTo = new Date(dTo).setHours(23, 59, 59, 999);
            if (recTime > tTo) {
                return false;
            }
        }
        return true;
    }

    /**
     * Filter matcher: Search query
     */
    private _matchesSearch(item: PRPaymentItemData, sSearch: string): boolean {
        if (!sSearch) {
            return true;
        }
        const pr = (item.PurchaseRequisition || "").toLowerCase();
        const po = (item.PurchaseOrder || "").toLowerCase();
        const mat = (item.Material || "").toLowerCase();
        const txt = (item.PurchaseRequisitionItemText || "").toLowerCase();
        return pr.includes(sSearch) || po.includes(sSearch) || mat.includes(sSearch) || txt.includes(sSearch);
    }

    /**
     * Filter matcher: Plant
     */
    private _matchesPlant(item: PRPaymentItemData, sPlant: string): boolean {
        return !sPlant || (item.Plant || "").trim() === sPlant;
    }

    /**
     * Filter matcher: Purchasing Group
     */
    private _matchesPurchasingGroup(item: PRPaymentItemData, sGroup: string): boolean {
        return !sGroup || (item.PurchasingGroup || "").trim() === sGroup;
    }

    /**
     * Filter matcher: Material
     */
    private _matchesMaterial(item: PRPaymentItemData, sMaterial: string): boolean {
        if (!sMaterial) {
            return true;
        }
        const mat = (item.Material || "").toLowerCase();
        const txt = (item.PurchaseRequisitionItemText || "").toLowerCase();
        return mat.includes(sMaterial) || txt.includes(sMaterial);
    }

    /**
     * Filter matcher: Overall Status (PaymentStatus)
     */
    private _matchesStatus(item: PRPaymentItemData, sStatus: string): boolean {
        return !sStatus || (item.PaymentStatus || "").toUpperCase().trim() === sStatus;
    }

    /**
     * Filter matcher: Currency
     */
    private _matchesCurrency(item: PRPaymentItemData, sCurrency: string): boolean {
        if (!sCurrency) {
            return true;
        }
        const prCurr = (item.PurReqnItemCurrency || "").toUpperCase();
        const poCurr = (item.DocumentCurrency || "").toUpperCase();
        const irCurr = (item.Currency || "").toUpperCase();
        return prCurr === sCurrency || poCurr === sCurrency || irCurr === sCurrency;
    }

    /**
     * Builds list of human-readable descriptions of active filters
     */
    private _buildActiveFilterTexts(c: FilterCriteria): string[] {
        const aTexts: string[] = [];
        if (c.prFrom) {
            const sFromStr = formatter.formatDate(c.prFrom);
            const sToStr = c.prTo ? formatter.formatDate(c.prTo) : "...";
            aTexts.push(`Tgl PR: ${sFromStr} s/d ${sToStr}`);
        } else if (c.year === "CURRENT") {
            aTexts.push(`Tahun: ${this._currentYear} (Tahun Berjalan)`);
        } else if (c.year !== "ALL") {
            aTexts.push(`Tahun: ${c.year}`);
        }

        if (c.search) {
            aTexts.push(`Pencarian: "${c.search}"`);
        }
        if (c.plant) {
            aTexts.push(`Plant: ${c.plant}`);
        }
        if (c.pGroup) {
            aTexts.push(`Purchasing Group: ${c.pGroup}`);
        }
        if (c.material) {
            aTexts.push(`Material: "${c.material}"`);
        }
        if (c.status) {
            aTexts.push(`Payment Status: ${c.status}`);
        }
        if (c.currency) {
            aTexts.push(`Mata Uang: ${c.currency}`);
        }
        return aTexts;
    }

    /**
     * Determines the human-readable period label for the highlight card
     */
    private _getPeriodLabel(bHasCustomDateRange: boolean, sYear: string, bHasMultipleFilters: boolean): string {
        let sLabel = `Tahun Berjalan (${this._currentYear})`;
        if (bHasCustomDateRange) {
            sLabel = "Rentang Tanggal Terfilter";
        } else if (sYear === "ALL") {
            sLabel = "Semua Periode";
        } else if (sYear !== "CURRENT") {
            sLabel = `Tahun ${sYear}`;
        }
        if (bHasMultipleFilters) {
            sLabel += " (Terfilter)";
        }
        return sLabel;
    }

    /**
     * Computes and writes highlight metrics to the view model:
     * - Total PR Document: total filtered records (default: current year)
     * - Highlight PR Open: IsClosed tidak sama dengan X
     * - Highlight PO Open: IsCompletelyDelivered tidak sama dengan X
     */
    private _updateHighlightMetrics(
        oViewModel: JSONModel,
        aFiltered: PRPaymentItemData[],
        sYear: string,
        bHasCustomDateRange: boolean,
        bHasMultipleFilters: boolean
    ): void {
        let nTotalPR = 0;
        let nPROpen = 0;
        let nPOOpen = 0;

        aFiltered.forEach((item) => {
            nTotalPR++;
            // Highlight PR open jika IsClosed tidak sama dengan X
            const sIsClosed = String(item.IsClosed ?? "").trim().toUpperCase();
            if (sIsClosed !== "X") {
                nPROpen++;
            }
            // Highlight PO open jika PurchaseOrder tidak null/kosong dan IsCompletelyDelivered tidak sama dengan X
            const sPO = String(item.PurchaseOrder ?? "").trim();
            const sIsDelivered = String(item.IsCompletelyDelivered ?? "").trim().toUpperCase();
            if (sPO !== "" && sIsDelivered !== "X") {
                nPOOpen++;
            }
        });

        const sPeriodLabel = this._getPeriodLabel(bHasCustomDateRange, sYear, bHasMultipleFilters);

        oViewModel.setProperty("/kpiTotal", nTotalPR);
        oViewModel.setProperty("/kpiPROpen", nPROpen);
        oViewModel.setProperty("/kpiPOOpen", nPOOpen);
        oViewModel.setProperty("/totalCount", nTotalPR);

        oViewModel.setProperty("/highlightTotalPR", nTotalPR);
        oViewModel.setProperty("/highlightPeriodLabel", sPeriodLabel);
    }

    /**
     * Applies all search and filter criteria and updates the highlight summary
     */
    private _applyFiltersAndPagination(): void {
        const oViewModel = this.getView()?.getModel("viewModel") as JSONModel | undefined;
        if (!oViewModel) {
            return;
        }

        const sSearch = String(oViewModel.getProperty("/searchQuery") || "").trim().toLowerCase();
        const sYear = String(oViewModel.getProperty("/selectedYear") || "CURRENT");
        const dPRFrom = oViewModel.getProperty("/prDateFrom") as Date | null | undefined;
        const dPRTo = oViewModel.getProperty("/prDateTo") as Date | null | undefined;
        const sPlant = String(oViewModel.getProperty("/selectedPlant") || "");
        const sPGroup = String(oViewModel.getProperty("/selectedPurchasingGroup") || "");
        const sMaterial = String(oViewModel.getProperty("/selectedMaterial") || "").trim().toLowerCase();
        const sStatus = String(oViewModel.getProperty("/selectedStatus") || "").toUpperCase();
        const sCurrency = String(oViewModel.getProperty("/selectedCurrency") || "").toUpperCase();

        const bHasCustomDateRange = !!dPRFrom;
        const aActiveFilterTexts = this._buildActiveFilterTexts({
            search: sSearch,
            year: sYear,
            prFrom: dPRFrom,
            prTo: dPRTo,
            plant: sPlant,
            pGroup: sPGroup,
            material: sMaterial,
            status: sStatus,
            currency: sCurrency
        });

        // Filter the dataset using all criteria
        this._filteredRecords = this._allRecords.filter((item) =>
            this._matchesYear(item, sYear, bHasCustomDateRange) &&
            this._matchesPRDate(item, dPRFrom, dPRTo) &&
            this._matchesSearch(item, sSearch) &&
            this._matchesPlant(item, sPlant) &&
            this._matchesPurchasingGroup(item, sPGroup) &&
            this._matchesMaterial(item, sMaterial) &&
            this._matchesStatus(item, sStatus) &&
            this._matchesCurrency(item, sCurrency)
        );

        // Update highlight summary
        this._updateHighlightMetrics(
            oViewModel,
            this._filteredRecords,
            sYear,
            bHasCustomDateRange,
            aActiveFilterTexts.length > 1
        );

        const bHasActiveFilter = aActiveFilterTexts.length > 0;
        oViewModel.setProperty("/hasActiveFilter", bHasActiveFilter);
        oViewModel.setProperty("/activeFilterText", bHasActiveFilter ? `Filter Aktif: ${aActiveFilterTexts.join(" | ")}` : "");

        // Reset to page 1 and paginate
        oViewModel.setProperty("/currentPage", 1);
        this._paginate();
    }

    /**
     * Slices data for the current page and updates pagination buttons
     */
    private _paginate(): void {
        const oViewModel = this.getView()?.getModel("viewModel") as JSONModel | undefined;
        const oTableModel = this.getView()?.getModel("tableModel") as JSONModel | undefined;
        if (!oViewModel || !oTableModel) {
            return;
        }

        const nPageSize = parseInt(String(oViewModel.getProperty("/pageSize") || "50"), 10);
        const nTotalCount = this._filteredRecords.length;
        const nTotalPages = Math.max(1, Math.ceil(nTotalCount / nPageSize));
        let nCurrentPage = parseInt(String(oViewModel.getProperty("/currentPage") || "1"), 10);

        if (nCurrentPage < 1) {
            nCurrentPage = 1;
        }
        if (nCurrentPage > nTotalPages) {
            nCurrentPage = nTotalPages;
        }

        const nStartIndex = (nCurrentPage - 1) * nPageSize;
        const nEndIndex = Math.min(nStartIndex + nPageSize, nTotalCount);

        // Slice items and assign sequential rowNumber (1, 2, ... 50; 51, 52...)
        const aPageItems = this._filteredRecords.slice(nStartIndex, nEndIndex).map((item, idx) => {
            return {
                ...item,
                rowNumber: nStartIndex + idx + 1
            };
        });

        oTableModel.setProperty("/displayedItems", aPageItems);

        // Generate numbered page buttons (up to 7 visible around current)
        const aButtons: PageButtonInfo[] = [];
        const nMaxButtons = 7;
        let nStartPage = Math.max(1, nCurrentPage - Math.floor(nMaxButtons / 2));
        let nEndPage = nStartPage + nMaxButtons - 1;

        if (nEndPage > nTotalPages) {
            nEndPage = nTotalPages;
            nStartPage = Math.max(1, nEndPage - nMaxButtons + 1);
        }

        for (let p = nStartPage; p <= nEndPage; p++) {
            aButtons.push({
                page: p,
                active: p === nCurrentPage
            });
        }

        oViewModel.setProperty("/currentPage", nCurrentPage);
        oViewModel.setProperty("/totalPages", nTotalPages);
        oViewModel.setProperty("/pageStart", nTotalCount > 0 ? nStartIndex + 1 : 0);
        oViewModel.setProperty("/pageEnd", nEndIndex);
        oViewModel.setProperty("/hasPrev", nCurrentPage > 1);
        oViewModel.setProperty("/hasNext", nCurrentPage < nTotalPages);
        oViewModel.setProperty("/pageButtons", aButtons);
    }

    /**
     * User clicks "Terapkan Filter" in Filter Bar
     */
    public onApplyFilters(): void {
        this._applyFiltersAndPagination();
    }

    /**
     * Resets all search and filter criteria to Default (Current Year)
     */
    public onResetFilters(): void {
        const oViewModel = this.getView()?.getModel("viewModel") as JSONModel | undefined;
        if (oViewModel) {
            oViewModel.setProperty("/searchQuery", "");
            oViewModel.setProperty("/selectedYear", "CURRENT");
            oViewModel.setProperty("/prDateFrom", null);
            oViewModel.setProperty("/prDateTo", null);
            oViewModel.setProperty("/selectedPlant", "");
            oViewModel.setProperty("/selectedPurchasingGroup", "");
            oViewModel.setProperty("/selectedMaterial", "");
            oViewModel.setProperty("/selectedStatus", "");
            oViewModel.setProperty("/selectedCurrency", "");
        }

        this._applyFiltersAndPagination();
        MessageToast.show(`Filter telah direset ke default Tahun Berjalan (${this._currentYear}).`);
    }

    /**
     * Fast live search on table toolbar
     */
    public onLiveSearchTable(oEvent: UI5Event): void {
        const oSearchField = oEvent.getSource();
        const sVal = (oSearchField instanceof SearchField ? oSearchField.getValue() : "").trim();
        const oViewModel = this.getView()?.getModel("viewModel") as JSONModel | undefined;
        if (oViewModel) {
            oViewModel.setProperty("/searchQuery", sVal);
        }
        this._applyFiltersAndPagination();
    }

    /**
     * Pagination Controls
     */
    public onFirstPage(): void {
        const oViewModel = this.getView()?.getModel("viewModel") as JSONModel | undefined;
        if (oViewModel) {
            oViewModel.setProperty("/currentPage", 1);
            this._paginate();
        }
    }

    public onPrevPage(): void {
        const oViewModel = this.getView()?.getModel("viewModel") as JSONModel | undefined;
        if (oViewModel) {
            const nCur = parseInt(String(oViewModel.getProperty("/currentPage")), 10);
            if (nCur > 1) {
                oViewModel.setProperty("/currentPage", nCur - 1);
                this._paginate();
            }
        }
    }

    public onNextPage(): void {
        const oViewModel = this.getView()?.getModel("viewModel") as JSONModel | undefined;
        if (oViewModel) {
            const nCur = parseInt(String(oViewModel.getProperty("/currentPage")), 10);
            const nTotal = parseInt(String(oViewModel.getProperty("/totalPages")), 10);
            if (nCur < nTotal) {
                oViewModel.setProperty("/currentPage", nCur + 1);
                this._paginate();
            }
        }
    }

    public onLastPage(): void {
        const oViewModel = this.getView()?.getModel("viewModel") as JSONModel | undefined;
        if (oViewModel) {
            const nTotal = parseInt(String(oViewModel.getProperty("/totalPages")), 10);
            oViewModel.setProperty("/currentPage", nTotal);
            this._paginate();
        }
    }

    public onJumpToPage(oEvent: UI5Event): void {
        const oBtn = oEvent.getSource();
        if (!(oBtn instanceof Button)) {
            return;
        }
        const nTarget = parseInt(oBtn.getText(), 10);
        const oViewModel = this.getView()?.getModel("viewModel") as JSONModel | undefined;
        if (oViewModel && !isNaN(nTarget)) {
            oViewModel.setProperty("/currentPage", nTarget);
            this._paginate();
        }
    }

    public onChangePageSize(oEvent: UI5Event): void {
        const oSelect = oEvent.getSource();
        const oViewModel = this.getView()?.getModel("viewModel") as JSONModel | undefined;
        if (!(oSelect instanceof Select) || !oViewModel) {
            return;
        }

        const sKey = oSelect.getSelectedKey();
        const nSize = parseInt(sKey, 10) || 50;
        oViewModel.setProperty("/pageSize", sKey);
        oViewModel.setProperty("/currentPage", 1);
        this._paginate();

        MessageToast.show(`Pagination diatur ke ${nSize} data per layar.`);
    }

    /**
     * KPI Tiles press feedback
     */
    public onKpiTilePress(oEvent: UI5Event): void {
        const oTile = oEvent.getSource();
        if (!(oTile instanceof GenericTile)) {
            return;
        }

        const aCustomData = oTile.getCustomData();
        const oFilterData = aCustomData.find((cd) => cd.getKey() === "filterKey");
        const sKey = (oFilterData ? oFilterData.getValue() : "ALL") as string;

        const oViewModel = this.getView()?.getModel("viewModel") as JSONModel | undefined;
        if (!oViewModel) {
            return;
        }

        if (sKey === "PR_OPEN") {
            MessageToast.show(`Highlight PR Open (IsClosed !== 'X'): ${String(oViewModel.getProperty("/kpiPROpen") || 0)} dokumen.`);
        } else if (sKey === "PO_OPEN") {
            MessageToast.show(`Highlight PO Open (PO ada & IsCompletelyDelivered !== 'X'): ${String(oViewModel.getProperty("/kpiPOOpen") || 0)} dokumen.`);
        } else {
            MessageToast.show(`Highlight Total PR Document: ${String(oViewModel.getProperty("/kpiTotal") || 0)} dokumen.`);
        }
    }

    /**
     * Resolves binding context from event source or its parents
     */
    private _getBindingContextFromEvent(oEvent: UI5Event): unknown {
        let oCurr = oEvent.getSource() as { getBindingContext?: (s?: string) => unknown; getParent?: () => unknown } | null;
        while (oCurr) {
            if (typeof oCurr.getBindingContext === "function") {
                const ctx = oCurr.getBindingContext("tableModel") || oCurr.getBindingContext();
                if (ctx) {
                    return ctx;
                }
            }
            oCurr = typeof oCurr.getParent === "function" ? (oCurr.getParent() as typeof oCurr) : null;
        }
        return null;
    }

    /**
     * Navigates to PR Detail Screen with PR Number and Line Item as parameters
     */
    public onNavToDetail(oEvent: UI5Event): void {
        const oContext = this._getBindingContextFromEvent(oEvent) as { getObject?: () => PRPaymentItemData } | null;
        if (!oContext || typeof oContext.getObject !== "function") {
            MessageToast.show("Gagal membaca data baris untuk navigasi detail.");
            return;
        }

        const oData = oContext.getObject();
        const sPR = String(oData.PurchaseRequisition || "").trim();
        const sItem = String(oData.PurchaseRequisitionItem || "").trim();

        if (!sPR) {
            MessageToast.show("Nomor Purchase Requisition tidak ditemukan pada baris ini.");
            return;
        }

        // Store selected row data on component for instant display on Detail screen
        const oOwner = this.getOwnerComponent();
        if (oOwner) {
            oOwner.setModel(new JSONModel(oData), "selectedPR");
            if (this._allRecords && this._allRecords.length > 0) {
                oOwner.setModel(new JSONModel(this._allRecords), "allPRRecords");
            }
        }

        const oRouter = UIComponent.getRouterFor(this) || (oOwner as UIComponent)?.getRouter();
        if (oRouter) {
            oRouter.navTo("RouteDetail", {
                PurchaseRequisition: sPR,
                PurchaseRequisitionItem: sItem
            });
        } else {
            MessageToast.show("Router navigasi tidak tersedia.");
        }
    }

    /**
     * Row click opens Detail Screen (also keeps compatibility with dialog if needed)
     */
    public onPressRow(oEvent: UI5Event): void {
        this.onNavToDetail(oEvent);
    }

    public async onCloseDetailDialog(): Promise<void> {
        if (this._pDetailDialog) {
            const oDialog = await this._pDetailDialog;
            oDialog.close();
        }
    }

    /**
     * View Settings Dialog (Sort & Group)
     */
    public async onOpenViewSettings(): Promise<void> {
        if (!this._pViewSettingsDialog) {
            this._pViewSettingsDialog = (async (): Promise<ViewSettingsDialog> => {
                const oDialog = await Fragment.load({
                    id: this.getView()?.getId(),
                    name: "prpayment.projectprpayment.view.ViewSettingsDialog",
                    controller: this
                });
                const dialog = oDialog as ViewSettingsDialog;
                this.getView()?.addDependent(dialog);
                return dialog;
            })();
        }

        const oDialog = await this._pViewSettingsDialog;
        oDialog.open();
    }

    public onConfirmViewSettings(oEvent: UI5Event): void {
        const mParams = oEvent.getParameters() as {
            sortItem?: ViewSettingsItem;
            sortDescending?: boolean;
        };

        if (mParams.sortItem) {
            const sKey = mParams.sortItem.getKey() as keyof PRPaymentItemData;
            const bDesc = mParams.sortDescending ?? false;

            this._filteredRecords.sort((a, b) => {
                const valA = a[sKey];
                const valB = b[sKey];
                if (valA === valB) {
                    return 0;
                }
                if (valA === undefined || valA === null) {
                    return bDesc ? 1 : -1;
                }
                if (valB === undefined || valB === null) {
                    return bDesc ? -1 : 1;
                }
                if (valA < valB) {
                    return bDesc ? 1 : -1;
                }
                return bDesc ? -1 : 1;
            });

            this._paginate();
        }
    }

    /**
     * Exports all filtered data of current year/filter to Excel
     */
    public async onExportExcel(): Promise<void> {
        if (this._filteredRecords.length === 0) {
            MessageToast.show("Tidak ada data untuk diekspor");
            return;
        }

        const aCols = [
            { label: "No.", property: "rowNumber", type: EdmType.Number, scale: 0, width: 6 },
            { label: "Nomor PR", property: "PurchaseRequisition", type: EdmType.String, width: 14 },
            { label: "Item PR", property: "PurchaseRequisitionItem", type: EdmType.String, width: 10 },
            { label: "Tanggal PR", property: "PurchaseReqnCreationDate", type: EdmType.Date, format: "dd/mm/yyyy", width: 14 },
            { label: "Material", property: "Material", type: EdmType.String, width: 18 },
            { label: "Deskripsi Material", property: "PurchaseRequisitionItemText", type: EdmType.String, width: 30 },
            { label: "Plant", property: "Plant", type: EdmType.String, width: 10 },
            { label: "Purchasing Group", property: "PurchasingGroup", type: EdmType.String, width: 12 },
            { label: "Kuantitas PR", property: "PRQuantity", type: EdmType.Number, scale: 3, width: 14 },
            { label: "Satuan PR", property: "PRUnit", type: EdmType.String, width: 10 },
            { label: "Harga PR", property: "PurchaseRequisitionPrice", type: EdmType.Currency, unitProperty: "PurReqnItemCurrency", width: 18 },
            { label: "Mata Uang PR", property: "PurReqnItemCurrency", type: EdmType.String, width: 10 },
            { label: "Nomor PO", property: "PurchaseOrder", type: EdmType.String, width: 14 },
            { label: "Kuantitas PO", property: "POQuantity", type: EdmType.Number, scale: 3, width: 14 },
            { label: "Satuan PO", property: "POUnit", type: EdmType.String, width: 10 },
            { label: "Nilai Bersih PO", property: "NetAmount", type: EdmType.Currency, unitProperty: "DocumentCurrency", width: 18 },
            { label: "Mata Uang PO", property: "DocumentCurrency", type: EdmType.String, width: 10 },
            { label: "Dokumen GR", property: "GRDocument", type: EdmType.String, width: 14 },
            { label: "Kuantitas GR", property: "GRQuantity", type: EdmType.Number, scale: 3, width: 14 },
            { label: "Satuan GR", property: "GRUnit", type: EdmType.String, width: 10 },
            { label: "Dokumen IR", property: "IRDocument", type: EdmType.String, width: 14 },
            { label: "Nilai Tagihan PO", property: "PurchaseOrderAmount", type: EdmType.Currency, unitProperty: "Currency", width: 18 },
            { label: "Mata Uang Tagihan", property: "Currency", type: EdmType.String, width: 10 },
            { label: "Tanggal Posting", property: "PostingDate", type: EdmType.Date, format: "dd/mm/yyyy", width: 14 },
            { label: "Status Pembayaran", property: "PaymentStatus", type: EdmType.String, width: 16 },
            { label: "Hari Terbuka (Day Open)", property: "DayOpen", type: EdmType.Number, scale: 0, width: 14 }
        ];

        // Export array of filtered records
        const oSettings = {
            workbook: {
                columns: aCols,
                context: {
                    sheetName: "PR to Payment"
                }
            },
            dataSource: this._filteredRecords.map((item, idx) => ({ ...item, rowNumber: idx + 1 })),
            fileName: `Laporan_PR_to_Payment_${this._currentYear}_${new Date().toISOString().slice(0, 10)}.xlsx`,
            worker: false
        };

        const oSheet = new Spreadsheet(oSettings);
        try {
            await oSheet.build();
            MessageToast.show("File Excel berhasil diunduh.");
        } catch {
            MessageToast.show("Gagal mengekspor file Excel.");
        } finally {
            oSheet.destroy();
        }
    }

    /**
     * Refreshes data from OData Service
     */
    public onRefresh(): void {
        MessageToast.show("Memperbarui data dari server...");
        this._loadDataFromOData();
    }
}
