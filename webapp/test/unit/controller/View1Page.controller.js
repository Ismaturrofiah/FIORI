/*global QUnit*/
sap.ui.define([
	"prpayment/projectprpayment/controller/View1.controller"
], function (Controller) {
	"use strict";

	QUnit.module("View1 Controller");

	QUnit.test("I should test the View1 controller", function (assert) {
		const oAppController = new Controller();
		assert.ok(oAppController);
	});
});
