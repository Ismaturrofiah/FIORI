sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/m/MessageToast",
    "sap/m/GenericTile",
    "sap/m/SearchField",
    "sap/m/Select",
    "sap/m/Button",
    "sap/ui/export/Spreadsheet",
    "sap/ui/export/library",
    "prpayment/projectprpayment/model/formatter",
    "prpayment/projectprpayment/model/StandardPRNavigation"
], function (
    Controller,
    JSONModel,
    Fragment,
    MessageToast,
    GenericTile,
    SearchField,
    Select,
    Button,
    Spreadsheet,
    exportLibrary,
    formatter,
    StandardPRNavigation
) {
    "use strict";

    const EdmType = exportLibrary.EdmType;

    return Controller.extend("prpayment.projectprpayment.controller.View1", {
        formatter: formatter,

        onInit: function () {
            this._pViewSettingsDialog = null;
            this._allRecords = [];
            this._filteredRecords = [];
            this._currentYear = new Date().getFullYear();

            const oViewModel = new JSONModel({
                searchQuery: "",
                selectedYear: "CURRENT", // Default: Current Year
                currentYear: this._currentYear,
                currentYearLabel: `Tahun Berjalan (${this._currentYear})`,
                prDateFrom: null,
                prDateTo: null,
                selectedPlant: "",
                selectedPurchasingGroup: "",
                selectedMaterial: "",
                selectedStatus: "",
                selectedCurrency: "",
                selectedAging: "",
                selectedHighlight: "ALL", // ALL | PR_OPEN | PO_OPEN (KPI tile filter)
                pageSize: "50", // Default: 50 items per screen
                currentPage: 1,
                totalPages: 1,
                pageStart: 0,
                pageEnd: 0,
                totalCount: 0,
                hasPrev: false,
                hasNext: false,
                pageButtons: [],
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

            this.getView().setModel(oViewModel, "viewModel");

            // Model dedicated to holding current paginated items
            const oTableModel = new JSONModel({
                displayedItems: []
            });
            this.getView().setModel(oTableModel, "tableModel");

            // Load data from OData model once initialized
            this._loadDataFromOData();
        },

        _getViewModel: function () {
            return this.getView().getModel("viewModel");
        },

        /**
         * Reads all data from the CDS OData Service
         */
        _loadDataFromOData: function () {
            const oOwner = this.getOwnerComponent();
            const oModel = (oOwner && oOwner.getModel()) || this.getView().getModel();
            if (!oModel) {
                return;
            }

            const fnRead = () => {
                oModel.read("/Z_PRtoPayment", {
                    success: (oData) => {
                        this._allRecords = (oData && oData.results) || [];
                        if (oOwner) {
                            oOwner.setModel(new JSONModel(this._allRecords), "allPRRecords");
                        }
                        this._populateFilterDropdowns();
                        this._applyFiltersAndPagination();
                    },
                    error: () => {
                        MessageToast.show("Gagal memuat data dari CDS OData Service.");
                    }
                });
            };

            oModel.metadataLoaded().then(fnRead).catch(fnRead);
        },

        /**
         * Extracts Date object from Date or OData date string
         * @param {Date|string|null} [dateVal] date value
         * @returns {Date|null} parsed date
         */
        _getRecordDate: function (dateVal) {
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
        },

        /**
         * Extracts year number from Date or OData date string
         * @param {Date|string|null} [dateVal] date value
         * @returns {number|null} year
         */
        _getRecordYear: function (dateVal) {
            const d = this._getRecordDate(dateVal);
            return d ? d.getFullYear() : null;
        },

        /**
         * Populates dynamic filter dropdown lists from the current dataset:
         * - Transaction Year from PR Date
         * - Plant list from table
         * - Purchasing Group list from table
         * - Overall Status list from table
         * - Currency list from table
         */
        _populateFilterDropdowns: function () {
            const oViewModel = this._getViewModel();
            if (!oViewModel) {
                return;
            }

            const yearSet = new Set();
            const plantSet = new Set();
            const pGroupSet = new Set();
            const statusSet = new Set();
            const currencySet = new Set();

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

            const toKeyText = (v) => ({ key: String(v), text: String(v) });

            oViewModel.setProperty("/yearList", [
                { key: "CURRENT", text: `Tahun Berjalan (${this._currentYear})` },
                { key: "ALL", text: "Semua Tahun" }
            ].concat(Array.from(yearSet).sort((a, b) => b - a).map(toKeyText)));

            oViewModel.setProperty("/plantList", [{ key: "", text: "Semua Plant" }]
                .concat(Array.from(plantSet).sort().map(toKeyText)));

            oViewModel.setProperty("/purchasingGroupList", [{ key: "", text: "Semua Purchasing Group" }]
                .concat(Array.from(pGroupSet).sort().map(toKeyText)));

            oViewModel.setProperty("/statusList", [{ key: "", text: "Semua Payment Status" }]
                .concat(Array.from(statusSet).sort().map(toKeyText)));

            oViewModel.setProperty("/currencyList", [{ key: "", text: "Semua Mata Uang" }]
                .concat(Array.from(currencySet).sort().map(toKeyText)));
        },

        /**
         * Filter matcher: Year filter
         */
        _matchesYear: function (item, sYear, bHasCustomDateRange) {
            // If a specific date range is selected, date range takes precedence
            if (bHasCustomDateRange || sYear === "ALL") {
                return true;
            }
            const targetYear = sYear === "CURRENT" ? this._currentYear : parseInt(sYear, 10);
            return this._getRecordYear(item.PurchaseReqnCreationDate) === targetYear;
        },

        /**
         * Filter matcher: PR Creation Date Range
         */
        _matchesPRDate: function (item, dFrom, dTo) {
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
        },

        /**
         * Filter matcher: Search query
         */
        _matchesSearch: function (item, sSearch) {
            if (!sSearch) {
                return true;
            }
            const pr = (item.PurchaseRequisition || "").toLowerCase();
            const po = (item.PurchaseOrder || "").toLowerCase();
            const mat = (item.Material || "").toLowerCase();
            const txt = (item.PurchaseRequisitionItemText || "").toLowerCase();
            return pr.includes(sSearch) || po.includes(sSearch) || mat.includes(sSearch) || txt.includes(sSearch);
        },

        /**
         * Filter matcher: Plant
         */
        _matchesPlant: function (item, sPlant) {
            return !sPlant || (item.Plant || "").trim() === sPlant;
        },

        /**
         * Filter matcher: Purchasing Group
         */
        _matchesPurchasingGroup: function (item, sGroup) {
            return !sGroup || (item.PurchasingGroup || "").trim() === sGroup;
        },

        /**
         * Filter matcher: Material
         */
        _matchesMaterial: function (item, sMaterial) {
            if (!sMaterial) {
                return true;
            }
            const mat = (item.Material || "").toLowerCase();
            const txt = (item.PurchaseRequisitionItemText || "").toLowerCase();
            return mat.includes(sMaterial) || txt.includes(sMaterial);
        },

        /**
         * Filter matcher: Overall Status (PaymentStatus)
         */
        _matchesStatus: function (item, sStatus) {
            return !sStatus || (item.PaymentStatus || "").toUpperCase().trim() === sStatus;
        },

        /**
         * Filter matcher: Currency
         */
        _matchesCurrency: function (item, sCurrency) {
            if (!sCurrency) {
                return true;
            }
            const prCurr = (item.PurReqnItemCurrency || "").toUpperCase();
            const poCurr = (item.DocumentCurrency || "").toUpperCase();
            const irCurr = (item.Currency || "").toUpperCase();
            return prCurr === sCurrency || poCurr === sCurrency || irCurr === sCurrency;
        },

        /**
         * Builds list of human-readable descriptions of active filters
         * @param {object} c filter criteria
         * @returns {string[]} descriptions
         */
        _buildActiveFilterTexts: function (c) {
            const aTexts = [];
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
        },

        /**
         * Determines the human-readable period label for the highlight card
         */
        _getPeriodLabel: function (bHasCustomDateRange, sYear, bHasMultipleFilters) {
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
        },

        /**
         * PR Open: nomor Purchase Order masih kosong
         */
        _isPROpen: function (item) {
            return String(item.PurchaseOrder ?? "").trim() === "";
        },

        /**
         * PO Open: sudah ada nomor Purchase Order, tetapi nomor GR Document masih kosong
         */
        _isPOOpen: function (item) {
            return String(item.PurchaseOrder ?? "").trim() !== "" &&
                String(item.GRDocument ?? "").trim() === "";
        },

        /**
         * Filter matcher: Highlight tile (ALL | PR_OPEN | PO_OPEN)
         */
        _matchesHighlight: function (item, sHighlight) {
            if (sHighlight === "PR_OPEN") {
                return this._isPROpen(item);
            }
            if (sHighlight === "PO_OPEN") {
                return this._isPOOpen(item);
            }
            return true;
        },

        /**
         * Computes and writes highlight metrics to the view model.
         * Counts are based on the filter bar result (before the highlight filter),
         * so the tile numbers stay stable while switching between highlights:
         * - Total PR Document: total filtered records (default: current year)
         * - Highlight PR Open: PurchaseOrder kosong
         * - Highlight PO Open: PurchaseOrder terisi dan GRDocument kosong
         */
        _updateHighlightMetrics: function (oViewModel, aFiltered, sYear, bHasCustomDateRange, bHasMultipleFilters) {
            let nPROpen = 0;
            let nPOOpen = 0;

            aFiltered.forEach((item) => {
                if (this._isPROpen(item)) {
                    nPROpen++;
                }
                if (this._isPOOpen(item)) {
                    nPOOpen++;
                }
            });

            const nTotalPR = aFiltered.length;
            const sPeriodLabel = this._getPeriodLabel(bHasCustomDateRange, sYear, bHasMultipleFilters);

            oViewModel.setProperty("/kpiTotal", nTotalPR);
            oViewModel.setProperty("/kpiPROpen", nPROpen);
            oViewModel.setProperty("/kpiPOOpen", nPOOpen);

            oViewModel.setProperty("/highlightTotalPR", nTotalPR);
            oViewModel.setProperty("/highlightPeriodLabel", sPeriodLabel);
        },

        /**
         * Applies all search and filter criteria and updates the highlight summary
         */
        _applyFiltersAndPagination: function () {
            const oViewModel = this._getViewModel();
            if (!oViewModel) {
                return;
            }

            const sSearch = String(oViewModel.getProperty("/searchQuery") || "").trim().toLowerCase();
            const sYear = String(oViewModel.getProperty("/selectedYear") || "CURRENT");
            const dPRFrom = oViewModel.getProperty("/prDateFrom");
            const dPRTo = oViewModel.getProperty("/prDateTo");
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

            // Filter the dataset using all filter bar criteria
            const aBaseRecords = this._allRecords.filter((item) =>
                this._matchesYear(item, sYear, bHasCustomDateRange) &&
                this._matchesPRDate(item, dPRFrom, dPRTo) &&
                this._matchesSearch(item, sSearch) &&
                this._matchesPlant(item, sPlant) &&
                this._matchesPurchasingGroup(item, sPGroup) &&
                this._matchesMaterial(item, sMaterial) &&
                this._matchesStatus(item, sStatus) &&
                this._matchesCurrency(item, sCurrency)
            );

            // Update highlight summary (counts based on filter bar result)
            this._updateHighlightMetrics(
                oViewModel,
                aBaseRecords,
                sYear,
                bHasCustomDateRange,
                aActiveFilterTexts.length > 1
            );

            // Apply the selected highlight tile (PR Open / PO Open) on top of the filter bar result
            const sHighlight = String(oViewModel.getProperty("/selectedHighlight") || "ALL");
            this._filteredRecords = aBaseRecords.filter((item) => this._matchesHighlight(item, sHighlight));
            oViewModel.setProperty("/totalCount", this._filteredRecords.length);

            if (sHighlight === "PR_OPEN") {
                aActiveFilterTexts.push("Highlight: PR Open (PO kosong)");
            } else if (sHighlight === "PO_OPEN") {
                aActiveFilterTexts.push("Highlight: PO Open (GR kosong)");
            }

            const bHasActiveFilter = aActiveFilterTexts.length > 0;
            oViewModel.setProperty("/hasActiveFilter", bHasActiveFilter);
            oViewModel.setProperty("/activeFilterText", bHasActiveFilter ? `Filter Aktif: ${aActiveFilterTexts.join(" | ")}` : "");

            // Reset to page 1 and paginate
            oViewModel.setProperty("/currentPage", 1);
            this._paginate();
        },

        /**
         * Slices data for the current page and updates pagination buttons
         */
        _paginate: function () {
            const oViewModel = this._getViewModel();
            const oTableModel = this.getView().getModel("tableModel");
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
            const aPageItems = this._filteredRecords.slice(nStartIndex, nEndIndex).map((item, idx) =>
                Object.assign({}, item, { rowNumber: nStartIndex + idx + 1 })
            );

            oTableModel.setProperty("/displayedItems", aPageItems);

            // Generate numbered page buttons (up to 7 visible around current)
            const aButtons = [];
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
        },

        /**
         * User clicks "Terapkan Filter" in Filter Bar
         */
        onApplyFilters: function () {
            this._applyFiltersAndPagination();
        },

        /**
         * Resets all search and filter criteria to Default (Current Year)
         */
        onResetFilters: function () {
            const oViewModel = this._getViewModel();
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
                oViewModel.setProperty("/selectedHighlight", "ALL");
            }

            this._applyFiltersAndPagination();
            MessageToast.show(`Filter telah direset ke default Tahun Berjalan (${this._currentYear}).`);
        },

        /**
         * Fast live search on table toolbar
         */
        onLiveSearchTable: function (oEvent) {
            const oSearchField = oEvent.getSource();
            const sVal = (oSearchField instanceof SearchField ? oSearchField.getValue() : "").trim();
            const oViewModel = this._getViewModel();
            if (oViewModel) {
                oViewModel.setProperty("/searchQuery", sVal);
            }
            this._applyFiltersAndPagination();
        },

        /**
         * Pagination Controls
         */
        onFirstPage: function () {
            const oViewModel = this._getViewModel();
            if (oViewModel) {
                oViewModel.setProperty("/currentPage", 1);
                this._paginate();
            }
        },

        onPrevPage: function () {
            const oViewModel = this._getViewModel();
            if (oViewModel) {
                const nCur = parseInt(String(oViewModel.getProperty("/currentPage")), 10);
                if (nCur > 1) {
                    oViewModel.setProperty("/currentPage", nCur - 1);
                    this._paginate();
                }
            }
        },

        onNextPage: function () {
            const oViewModel = this._getViewModel();
            if (oViewModel) {
                const nCur = parseInt(String(oViewModel.getProperty("/currentPage")), 10);
                const nTotal = parseInt(String(oViewModel.getProperty("/totalPages")), 10);
                if (nCur < nTotal) {
                    oViewModel.setProperty("/currentPage", nCur + 1);
                    this._paginate();
                }
            }
        },

        onLastPage: function () {
            const oViewModel = this._getViewModel();
            if (oViewModel) {
                const nTotal = parseInt(String(oViewModel.getProperty("/totalPages")), 10);
                oViewModel.setProperty("/currentPage", nTotal);
                this._paginate();
            }
        },

        onJumpToPage: function (oEvent) {
            const oBtn = oEvent.getSource();
            if (!(oBtn instanceof Button)) {
                return;
            }
            const nTarget = parseInt(oBtn.getText(), 10);
            const oViewModel = this._getViewModel();
            if (oViewModel && !isNaN(nTarget)) {
                oViewModel.setProperty("/currentPage", nTarget);
                this._paginate();
            }
        },

        onChangePageSize: function (oEvent) {
            const oSelect = oEvent.getSource();
            const oViewModel = this._getViewModel();
            if (!(oSelect instanceof Select) || !oViewModel) {
                return;
            }

            const sKey = oSelect.getSelectedKey();
            const nSize = parseInt(sKey, 10) || 50;
            oViewModel.setProperty("/pageSize", sKey);
            oViewModel.setProperty("/currentPage", 1);
            this._paginate();

            MessageToast.show(`Pagination diatur ke ${nSize} data per layar.`);
        },

        /**
         * KPI Tiles press: filters the table by the selected highlight.
         * - Total PR Document: show all (removes highlight filter)
         * - PR Open / PO Open: show only matching rows; clicking the active tile again removes the filter
         */
        onKpiTilePress: function (oEvent) {
            const oTile = oEvent.getSource();
            if (!(oTile instanceof GenericTile)) {
                return;
            }

            const oFilterData = oTile.getCustomData().find((cd) => cd.getKey() === "filterKey");
            let sKey = oFilterData ? oFilterData.getValue() : "ALL";

            const oViewModel = this._getViewModel();
            if (!oViewModel) {
                return;
            }

            // Toggle: clicking the already active highlight returns to all data
            if (sKey === oViewModel.getProperty("/selectedHighlight")) {
                sKey = "ALL";
            }
            oViewModel.setProperty("/selectedHighlight", sKey);
            this._applyFiltersAndPagination();

            const nCount = this._filteredRecords.length;
            if (sKey === "PR_OPEN") {
                MessageToast.show(`Menampilkan ${nCount} PR Open (nomor PO masih kosong).`);
            } else if (sKey === "PO_OPEN") {
                MessageToast.show(`Menampilkan ${nCount} PO Open (nomor GR Document masih kosong).`);
            } else {
                MessageToast.show(`Menampilkan semua ${nCount} PR Document.`);
            }
        },

        /**
         * Resolves binding context from event source or its parents
         */
        _getBindingContextFromEvent: function (oEvent) {
            let oCurr = oEvent.getSource();
            while (oCurr) {
                if (typeof oCurr.getBindingContext === "function") {
                    const ctx = oCurr.getBindingContext("tableModel") || oCurr.getBindingContext();
                    if (ctx) {
                        return ctx;
                    }
                }
                oCurr = typeof oCurr.getParent === "function" ? oCurr.getParent() : null;
            }
            return null;
        },

        /**
         * Detail button: opens the PR item in the standard Fiori app
         * "Manage Purchase Requisitions" (#PurchaseRequisition-maintain) in a new browser tab
         */
        onOpenStandardPR: function (oEvent) {
            const oContext = this._getBindingContextFromEvent(oEvent);
            if (!oContext || typeof oContext.getObject !== "function") {
                MessageToast.show("Gagal membaca data baris.");
                return;
            }

            const oData = oContext.getObject();
            StandardPRNavigation.openInNewTab(
                this.getOwnerComponent(),
                oData.PurchaseRequisition,
                oData.PurchaseRequisitionItem
            );
        },

        /**
         * View Settings Dialog (Sort & Group)
         */
        onOpenViewSettings: function () {
            if (!this._pViewSettingsDialog) {
                this._pViewSettingsDialog = Fragment.load({
                    id: this.getView().getId(),
                    name: "prpayment.projectprpayment.view.ViewSettingsDialog",
                    controller: this
                }).then((oDialog) => {
                    this.getView().addDependent(oDialog);
                    return oDialog;
                });
            }

            this._pViewSettingsDialog.then((oDialog) => oDialog.open());
        },

        onConfirmViewSettings: function (oEvent) {
            const mParams = oEvent.getParameters();

            if (mParams.sortItem) {
                const sKey = mParams.sortItem.getKey();
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
        },

        /**
         * Exports all filtered data of current year/filter to Excel
         */
        onExportExcel: function () {
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
            const oSheet = new Spreadsheet({
                workbook: {
                    columns: aCols,
                    context: {
                        sheetName: "PR to Payment"
                    }
                },
                dataSource: this._filteredRecords.map((item, idx) => Object.assign({}, item, { rowNumber: idx + 1 })),
                fileName: `Laporan_PR_to_Payment_${this._currentYear}_${new Date().toISOString().slice(0, 10)}.xlsx`,
                worker: false
            });

            oSheet.build()
                .then(() => {
                    MessageToast.show("File Excel berhasil diunduh.");
                })
                .catch(() => {
                    MessageToast.show("Gagal mengekspor file Excel.");
                })
                .finally(() => {
                    oSheet.destroy();
                });
        },

        /**
         * Refreshes data from OData Service
         */
        onRefresh: function () {
            MessageToast.show("Memperbarui data dari server...");
            this._loadDataFromOData();
        }
    });
});
