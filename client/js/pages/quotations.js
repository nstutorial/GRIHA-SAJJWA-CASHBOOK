/* =========================================================
   QUOTATION MODULE
   TALLY-STYLE QUOTATION
   ========================================================= */

let quotationItems = [
    {
        description: "",
        hsn: "",
        qty: 1,
        rate: 0,
        gst: 18
    }
];

let editingBusinessId = null;
let editingQuotationId = null;

const DEFAULT_QUOTATION_NOTES =
    "Thank you for considering our quotation.";

const DEFAULT_QUOTATION_TERMS =
    "Prices are inclusive of applicable GST. Delivery and payment terms are subject to mutual confirmation.";


/* =========================================================
   BUSINESS
========================================================= */

const quotationBusiness = () =>
    data
        .businesses()
        .find(
            (r) =>
                text(r._id) ===
                text($("#quotationBusiness")?.value)
        );


/* =========================================================
   QUOTATION ITEM CALCULATION
========================================================= */

function qMath(i) {

    const qty = Math.max(
        num(i.qty),
        1
    );

    const gross =
        qty * num(i.rate);

    const taxable =
        num(i.gst)
            ? gross /
              (1 + num(i.gst) / 100)
            : gross;

    const tax =
        gross - taxable;

    return {
        qty,
        gross,
        taxable,
        tax
    };
}


/* =========================================================
   QUOTATION TOTALS
========================================================= */

function qTotals() {

    const subtotal =
        quotationItems.reduce(
            (s, i) =>
                s + qMath(i).gross,
            0
        );

    const taxAmount =
        quotationItems.reduce(
            (s, i) =>
                s + qMath(i).tax,
            0
        );

    const discount =
        num(
            $("#quotationForm")
                ?.discount?.value
        );

    /*
     * Amount after discount,
     * before automatic round-off.
     */
    const before =
        Math.max(
            subtotal - discount,
            0
        );

    /*
     * Round final amount to
     * nearest whole rupee.
     *
     * Example:
     * 69676.50 -> 69677
     * 69676.40 -> 69676
     */
    const total =
        Math.round(before);

    /*
     * Actual round-off difference.
     *
     * Example:
     * 69677 - 69676.50 = +0.50
     *
     * 69676 - 69676.40 = -0.40
     */
    const roundOff =
        Math.round(
            (total - before) * 100
        ) / 100;

    return {

        subtotal,

        discount,

        taxableAmount:
            subtotal - taxAmount,

        taxAmount,

        roundOff,

        total
    };
}


/* =========================================================
   QUOTATION TOTAL CARDS
========================================================= */

function renderQuotationTotals() {

    const n =
        $("#quotationTotals");

    if (!n) return;

    const v =
        qTotals();

    n.innerHTML = [

        [
            "Subtotal",
            v.subtotal
        ],

        [
            "Discount",
            -v.discount
        ],

        [
            "Auto Round Off",
            v.roundOff
        ],

        [
            "Total",
            v.total
        ]

    ]
        .map(
            (x) => `
                <div class="total-card">
                    <small>
                        ${x[0]}
                    </small>

                    <strong>
                        ${money2(x[1])}
                    </strong>
                </div>
            `
        )
        .join("");
}


/* =========================================================
   QUOTATION ITEM TABLE
========================================================= */

function renderQuotationItems() {

    const n =
        $("#quotationItemTable");

    if (!n) return;

    const v =
        qTotals();

    n.innerHTML = `

        <thead>

            <tr>

                <th>Description</th>

                <th>HSN</th>

                <th>Qty</th>

                <th>Rate Incl. Tax</th>

                <th>Taxable Amount</th>

                <th>GST Rate</th>

                <th>GST Amount</th>

                <th>Total</th>

                <th></th>

            </tr>

        </thead>


        <tbody>

            ${quotationItems
                .map(
                    (i, x) => {

                        const c =
                            qMath(i);

                        return `

                            <tr>

                                <td>

                                    <input
                                        data-q="${x}"
                                        data-f="description"
                                        list="itemList"
                                        value="${html(
                                            i.description
                                        )}"
                                    >

                                </td>


                                <td>

                                    <input
                                        data-q="${x}"
                                        data-f="hsn"
                                        value="${html(
                                            i.hsn
                                        )}"
                                    >

                                </td>


                                <td>

                                    <input
                                        data-q="${x}"
                                        data-f="qty"
                                        type="number"
                                        min="1"
                                        step="1"
                                        value="${c.qty}"
                                    >

                                </td>


                                <td>

                                    <input
                                        data-q="${x}"
                                        data-f="rate"
                                        type="number"
                                        min="0"
                                        step=".01"
                                        value="${decimal2(
                                            i.rate
                                        )}"
                                    >

                                </td>


                                <td
                                    class="num"
                                    data-q-calc="${x}"
                                    data-q-calc-field="taxable"
                                >

                                    ${money2(
                                        c.taxable
                                    )}

                                </td>


                                <td>

                                    <input
                                        data-q="${x}"
                                        data-f="gst"
                                        type="number"
                                        min="0"
                                        step=".01"
                                        value="${decimal2(
                                            i.gst
                                        )}"
                                    > %

                                </td>


                                <td
                                    class="num"
                                    data-q-calc="${x}"
                                    data-q-calc-field="tax"
                                >

                                    ${money2(
                                        c.tax
                                    )}

                                </td>


                                <td
                                    class="num"
                                    data-q-calc="${x}"
                                    data-q-calc-field="gross"
                                >

                                    ${money2(
                                        c.gross
                                    )}

                                </td>


                                <td>

                                    <button
                                        class="icon-btn"
                                        type="button"
                                        data-del-q="${x}"
                                    >
                                        ×
                                    </button>

                                </td>

                            </tr>

                        `;
                    }
                )
                .join("")}

        </tbody>


        <tfoot>

            <tr>

                <td colspan="4">

                    <b>
                        Goods Total
                    </b>

                </td>


                <td class="num">

                    <b>
                        ${money2(
                            v.taxableAmount
                        )}
                    </b>

                </td>


                <td></td>


                <td class="num">

                    <b>
                        ${money2(
                            v.taxAmount
                        )}
                    </b>

                </td>


                <td class="num">

                    <b>
                        ${money2(
                            v.subtotal
                        )}
                    </b>

                </td>


                <td></td>

            </tr>

        </tfoot>
    `;


    /* =====================================================
       ITEM INPUT EVENTS
    ===================================================== */

    $$("[data-q]", n)
        .forEach(
            (e) => {

                const sync =
                    () => {

                        const index =
                            +e.dataset.q;

                        const item =
                            quotationItems[
                                index
                            ];

                        item[
                            e.dataset.f
                        ] =
                            e.value;

                        const c =
                            qMath(item);


                        const taxable =
                            n.querySelector(
                                `[data-q-calc="${index}"][data-q-calc-field="taxable"]`
                            );


                        const tax =
                            n.querySelector(
                                `[data-q-calc="${index}"][data-q-calc-field="tax"]`
                            );


                        const gross =
                            n.querySelector(
                                `[data-q-calc="${index}"][data-q-calc-field="gross"]`
                            );


                        if (taxable) {

                            taxable.textContent =
                                money2(
                                    c.taxable
                                );
                        }


                        if (tax) {

                            tax.textContent =
                                money2(
                                    c.tax
                                );
                        }


                        if (gross) {

                            gross.textContent =
                                money2(
                                    c.gross
                                );
                        }


                        renderQuotationTotals();
                    };


                e.oninput =
                    sync;


                e.onchange =
                    () => {

                        sync();


                        const i =
                            quotationItems[
                                +e.dataset.q
                            ];


                        if (
                            e.dataset.f ===
                            "description"
                        ) {

                            const d =
                                itemDetailsForReceipt(
                                    e.value
                                );


                            if (d) {

                                Object.assign(
                                    i,
                                    {

                                        hsn:
                                            d.hsn ||
                                            i.hsn,

                                        rate:
                                            d.rate ||
                                            i.rate
                                    }
                                );
                            }
                        }


                        renderQuotationItems();
                    };
            }
        );


    /* =====================================================
       DELETE ITEM
    ===================================================== */

    $$("[data-del-q]", n)
        .forEach(
            (e) => {

                e.onclick =
                    () => {

                        quotationItems.splice(
                            +e.dataset.delQ,
                            1
                        );


                        if (
                            !quotationItems.length
                        ) {

                            quotationItems = [

                                {
                                    description: "",
                                    hsn: "",
                                    qty: 1,
                                    rate: 0,
                                    gst: 18
                                }

                            ];
                        }


                        renderQuotationItems();
                    };
            }
        );


    renderQuotationTotals();
}


/* =========================================================
   BUSINESS SELECT
========================================================= */

function renderQuotationBusinessSelect() {

    const s =
        $("#quotationBusiness");

    if (!s) return;

    const value =
        s.value;

    s.innerHTML =
        `
        <option value="">
            Select business
        </option>
        ` +

        data
            .businesses()
            .filter(
                (x) =>
                    x.active !== false
            )
            .map(
                (x) =>
                    `
                    <option
                        value="${html(
                            x._id
                        )}"
                    >
                        ${html(x.name)}
                    </option>
                    `
            )
            .join("");

    s.value =
        value;
}


/* =========================================================
   BUSINESS TABLE
========================================================= */

function renderBusinesses() {

    const n =
        $("#businessTable");

    if (!n) return;

    table(

        n,

        [

            {
                label: "Business",
                key: "name"
            },

            {
                label: "GSTIN",
                key: "gstin"
            },

            {
                label: "Phone",
                key: "mobile"
            },

            {

                label: "Action",

                key: "x",

                render: (r) =>
                    `
                    <button
                        class="secondary"
                        type="button"
                        data-eb="${html(
                            r._id
                        )}"
                    >
                        Edit
                    </button>
                    `
            }

        ],

        data.businesses()
    );


    $$("[data-eb]", n)
        .forEach(
            (e) =>
                (e.onclick =
                    () =>
                        editBusiness(
                            e.dataset.eb
                        ))
        );
}


/* =========================================================
   QUOTATION REGISTER
========================================================= */

function renderQuotationRegister() {

    const n =
        $("#quotationTable");

    if (!n) return;

    table(

        n,

        [

            {
                label: "Quotation",
                key: "quotationNo"
            },

            {
                label: "Date",
                key: "date"
            },

            {
                label: "Business",
                key: "businessName"
            },

            {

                label: "Customer",

                key: "customer",

                render: (r) =>
                    html(
                        r.customer?.name
                    )
            },

            {

                label: "Total",

                key: "total",

                render: (r) =>
                    money2(
                        r.total
                    )
            },

            {

                label: "Action",

                key: "x",

                render: (r) =>
                    `

                    <button
                        class="secondary"
                        type="button"
                        data-eq="${html(
                            r._id
                        )}"
                    >
                        Edit
                    </button>


                    <button
                        class="secondary"
                        type="button"
                        data-pq="${html(
                            r._id
                        )}"
                    >
                        Print
                    </button>


                    <button
                        class="secondary"
                        type="button"
                        data-dc="${html(
                            r._id
                        )}"
                    >
                        Delivery Challan
                    </button>


                    <button
                        class="secondary"
                        type="button"
                        data-convert-quotation="${html(
                            r._id
                        )}"
                    >
                        Convert to Tax Invoice
                    </button>


                    <button
                        class="delete-symbol"
                        type="button"
                        data-dq="${html(
                            r._id
                        )}"
                    >
                        &#128465;
                    </button>

                    `
            }

        ],

        data
            .quotations()
            .slice()
            .reverse()
    );


    $$("[data-eq]", n)
        .forEach(
            (e) =>
                (e.onclick =
                    () =>
                        editQuotation(
                            e.dataset.eq
                        ))
        );


    $$("[data-pq]", n)
        .forEach(
            (e) =>
                (e.onclick =
                    () =>
                        printQuotation(
                            data
                                .quotations()
                                .find(
                                    (r) =>
                                        text(
                                            r._id
                                        ) ===
                                        e.dataset.pq
                                )
                        ))
        );


    $$(`[data-dc]`, n)
        .forEach(
            (e) =>
                (e.onclick =
                    () =>
                        printDeliveryChallan(
                            data
                                .quotations()
                                .find(
                                    (r) =>
                                        text(
                                            r._id
                                        ) ===
                                        e.dataset.dc
                                )
                        ))
        );


    $$("[data-dq]", n)
        .forEach(
            (e) =>
                (e.onclick =
                    () =>
                        deleteQuotation(
                            e.dataset.dq
                        ))
        );


    $$(
        "[data-convert-quotation]",
        n
    )
        .forEach(
            (e) =>
                (e.onclick =
                    () =>
                        convertQuotationToInvoice(
                            e.dataset
                                .convertQuotation
                        ))
        );
}


/* =========================================================
   RENDER QUOTATIONS
========================================================= */

function renderQuotations() {

    renderQuotationBusinessSelect();

    renderBusinesses();

    renderQuotationItems();

    renderQuotationRegister();
}


/* =========================================================
   SAVE BUSINESS
========================================================= */

async function saveBusiness(e) {

    e.preventDefault();

    const f =
        e.currentTarget;

    const p = {

        ...Object.fromEntries(
            new FormData(f)
        ),

        active: true
    };


    const list =
        apiAvailable
            ? seed.businesses
            : user.businesses;


    try {

        if (
            editingBusinessId
        ) {

            const r =
                apiAvailable

                    ? await apiPatch(
                        "businesses",
                        editingBusinessId,
                        p
                    )

                    : {
                        ...p,
                        _id:
                            editingBusinessId
                    };


            list.splice(

                list.findIndex(
                    (x) =>
                        text(x._id) ===
                        editingBusinessId
                ),

                1,

                r
            );

        } else {

            list.push(

                apiAvailable

                    ? await apiCreate(
                        "businesses",
                        p
                    )

                    : {
                        ...p,
                        _id:
                            `BUS-${Date.now()}`
                    }
            );
        }


        if (!apiAvailable)
            saveUser();


        editingBusinessId =
            null;


        f.reset();


        invalidateDataCache();


        renderQuotations();


        toast(
            "Business saved."
        );

    } catch (x) {

        toast(
            x.message ||
            "Business could not be saved."
        );
    }
}


/* =========================================================
   EDIT BUSINESS
========================================================= */

function editBusiness(id) {

    const b =
        data
            .businesses()
            .find(
                (x) =>
                    text(x._id) ===
                    text(id)
            );


    const f =
        $("#businessForm");


    if (!b) return;


    [
        "name",
        "gstin",
        "mobile",
        "email",
        "bankName",
        "accountName",
        "accountNumber",
        "ifsc",
        "state",
        "stateCode",
        "address",
        "notes",
        "terms",
        "quotationTemplate"

    ].forEach(

        (k) =>

            f[k] &&
            (
                f[k].value =
                    b[k] || ""
            )
    );


    editingBusinessId =
        id;


    f.name.focus();
}


/* =========================================================
   QUOTATION PAYLOAD
========================================================= */

function qPayload() {

    const f =
        $("#quotationForm");

    const b =
        quotationBusiness();

    const v =
        qTotals();


    if (!b)
        return null;


    return {

        quotationNo:
            text(
                f.quotationNo.value
            ),

        date:
            f.date.value,

        validUntil:
            f.validUntil.value,

        businessId:
            text(b._id),

        businessName:
            text(b.name),


        customer: {

            name:
                text(
                    f.customerName.value
                ),

            mobile:
                text(
                    f.customerMobile.value
                ),

            gstin:
                text(
                    f.customerGstin.value
                ),

            stateCode:
                text(
                    f.customerStateCode
                        .value
                ),

            address:
                text(
                    f.customerAddress
                        .value
                )
        },


        items:
            quotationItems.map(
                (i) => ({
                    ...i,
                    ...qMath(i)
                })
            ),


        ...v,


        notes:
            text(
                f.notes.value
            ) ||
            text(b.notes) ||
            DEFAULT_QUOTATION_NOTES,


        terms:
            text(
                f.terms.value
            ) ||
            text(b.terms) ||
            DEFAULT_QUOTATION_TERMS,


        status:
            "Draft"
    };
}


/* =========================================================
   SAVE QUOTATION
========================================================= */

async function saveQuotation(e) {

    e.preventDefault();


    const p =
        qPayload();


    const f =
        e.currentTarget;


    if (!p) {

        return toast(
            "Select a business before saving the quotation."
        );
    }


    const list =
        apiAvailable
            ? seed.quotations
            : user.quotations;


    try {

        let r;


        if (
            editingQuotationId
        ) {

            r =
                apiAvailable

                    ? await apiPatch(
                        "quotations",
                        editingQuotationId,
                        p
                    )

                    : {
                        ...p,
                        _id:
                            editingQuotationId
                    };


            list.splice(

                list.findIndex(
                    (x) =>
                        text(x._id) ===
                        editingQuotationId
                ),

                1,

                r
            );

        } else {

            r =
                apiAvailable

                    ? await apiCreate(
                        "quotations",
                        p
                    )

                    : {
                        ...p,
                        _id:
                            `QT-${Date.now()}`
                    };


            list.push(r);
        }


        if (!apiAvailable)
            saveUser();


        editingQuotationId =
            null;


        invalidateDataCache();


        printQuotation(r);


        f.reset();


        quotationItems = [

            {
                description: "",
                hsn: "",
                qty: 1,
                rate: 0,
                gst: 18
            }

        ];


        setDefaults();


        renderQuotations();


        toast(
            "Quotation saved."
        );

    } catch (x) {

        toast(
            x.message ||
            "Quotation could not be saved."
        );
    }
}


/* =========================================================
   EDIT QUOTATION
========================================================= */

function editQuotation(id) {

    const q =
        data
            .quotations()
            .find(
                (x) =>
                    text(x._id) ===
                    text(id)
            );


    const f =
        $("#quotationForm");


    if (!q) return;


    renderQuotationBusinessSelect();


    f.businessId.value =
        q.businessId;


    [
        "quotationNo",
        "date",
        "validUntil"

    ].forEach(

        (k) =>
            (
                f[k].value =
                    q[k] || ""
            )
    );


    f.customerName.value =
        q.customer?.name || "";


    f.customerMobile.value =
        q.customer?.mobile || "";


    f.customerGstin.value =
        q.customer?.gstin || "";


    f.customerStateCode.value =
        q.customer?.stateCode || "";


    f.customerAddress.value =
        q.customer?.address || "";


    f.discount.value =
        q.discount || 0;


    f.notes.value =
        q.notes || "";


    f.terms.value =
        q.terms || "";


    quotationItems =
        q.items.map(
            (i) => ({

                description:
                    i.description,

                hsn:
                    i.hsn,

                qty:
                    i.qty,

                rate:
                    i.rate,

                gst:
                    i.gst

            })
        );


    editingQuotationId =
        id;


    renderQuotationItems();


    f.quotationNo.focus();
}


/* =========================================================
   CONVERT QUOTATION TO INVOICE
========================================================= */

async function convertQuotationToInvoice(
    id
) {

    const quotation =
        data
            .quotations()
            .find(
                (row) =>
                    text(row._id) ===
                    text(id)
            );


    if (!quotation)
        return;


    const customer =
        quotation.customer || {};


    try {

        await upsertCustomer({

            name:
                text(
                    customer.name
                ),

            mobile:
                text(
                    customer.mobile
                ),

            address:
                text(
                    customer.address
                ),

            city: "",

            state: "",

            pin: "",

            stateCode:
                normalizeStateCode(
                    customer.stateCode
                ) ||
                stateCodeFromGstin(
                    customer.gstin
                ),

            gstin:
                text(
                    customer.gstin
                )
        });


        if (!apiAvailable)
            saveUser();


        invalidateDataCache();


        receiptItems =
            (
                quotation.items ||
                []
            )
                .map(
                    (item) => ({

                        description:
                            text(
                                item.description
                            ),

                        hsn:
                            text(
                                item.hsn
                            ),

                        qty:
                            num(
                                item.qty
                            ) || 1,

                        rate:
                            num(
                                item.rate
                            ),

                        total:
                            num(
                                item.gross
                            ) ||
                            num(
                                item.qty
                            ) *
                            num(
                                item.rate
                            ),

                        gst:
                            num(
                                item.gst
                            )
                    })
                );


        showView(
            "receipt"
        );


        const form =
            $("#receiptForm");


        form.customer.value =
            text(
                customer.name
            );


        form.mobile.value =
            text(
                customer.mobile
            );


        form.gstin.value =
            text(
                customer.gstin
            );


        form.stateCode.value =
            normalizeStateCode(
                customer.stateCode
            ) ||
            stateCodeFromGstin(
                customer.gstin
            ) ||
            businessStateCode();


        form.address.value =
            text(
                customer.address
            );


        form.remark.value =
            `Converted from quotation ${quotation.quotationNo}`;


        renderItems();


        await validateReceiptCustomer(
            false
        );


        if (apiAvailable) {

            await apiPatch(
                "quotations",
                id,
                {
                    ...quotation,
                    status:
                        "Converted to Tax Invoice"
                }
            );
        }


        quotation.status =
            "Converted to Tax Invoice";


        toast(
            "Quotation copied to Tax Invoice. Review and save the invoice."
        );

    } catch (error) {

        toast(
            error.message ||
            "Could not convert quotation."
        );
    }
}


/* =========================================================
   DELETE QUOTATION
========================================================= */

async function deleteQuotation(id) {

    const q =
        data
            .quotations()
            .find(
                (x) =>
                    text(x._id) ===
                    text(id)
            );


    if (
        !q ||
        !confirm(
            `Delete quotation ${q.quotationNo}?`
        )
    )
        return;


    try {

        if (apiAvailable) {

            await apiDelete(
                "quotations",
                id
            );
        }


        const l =
            apiAvailable
                ? seed.quotations
                : user.quotations;


        l.splice(

            l.findIndex(
                (x) =>
                    text(x._id) ===
                    text(id)
            ),

            1
        );


        if (!apiAvailable)
            saveUser();


        invalidateDataCache();


        renderQuotationRegister();


        toast(
            "Quotation deleted."
        );

    } catch (e) {

        toast(
            e.message ||
            "Quotation could not be deleted."
        );
    }
}


/* =========================================================
   NUMBER TO WORDS
========================================================= */

function words(n) {

    const o = [

        "",

        "One",
        "Two",
        "Three",
        "Four",
        "Five",
        "Six",
        "Seven",
        "Eight",
        "Nine",
        "Ten",
        "Eleven",
        "Twelve",
        "Thirteen",
        "Fourteen",
        "Fifteen",
        "Sixteen",
        "Seventeen",
        "Eighteen",
        "Nineteen"

    ];


    const t = [

        "",
        "",

        "Twenty",
        "Thirty",
        "Forty",
        "Fifty",
        "Sixty",
        "Seventy",
        "Eighty",
        "Ninety"

    ];


    const tw = (x) =>

        x < 20

            ? o[x]

            : `${t[~~(x / 10)]}${
                x % 10
                    ? ` ${o[x % 10]}`
                    : ""
            }`;


    const th = (x) =>

        x >= 100

            ? `${o[~~(x / 100)]} Hundred${
                x % 100
                    ? ` ${tw(x % 100)}`
                    : ""
            }`

            : tw(x);


    const v =
        Math.round(
            num(n)
        );


    return `Rupees ${
        [

            ~~(v / 100000) &&
                `${th(
                    ~~(
                        v / 100000
                    )
                )} Lakh`,

            ~~(
                (v % 100000) /
                1000
            ) &&
                `${th(
                    ~~(
                        (v % 100000) /
                        1000
                    )
                )} Thousand`,

            v % 1000 &&
                th(
                    v % 1000
                )

        ]
            .filter(Boolean)
            .join(" ") ||
        "Zero"
    } Only`;
}


/* =========================================================
   GST BREAKDOWN
========================================================= */

function gstBreakdown(
    quotation,
    business
) {

    const businessCode =
        normalizeStateCode(
            business.stateCode
        ) ||
        stateCodeFromGstin(
            business.gstin
        );


    const customerCode =
        normalizeStateCode(
            quotation.customer
                ?.stateCode
        ) ||
        stateCodeFromGstin(
            quotation.customer
                ?.gstin
        ) ||
        businessCode;


    const interstate =
        Boolean(
            businessCode &&
            customerCode &&
            businessCode !==
                customerCode
        );


    const rows =
        new Map();


    (
        quotation.items ||
        []
    )
        .forEach(
            (item) => {

                const key =
                    `${text(
                        item.hsn
                    ) || "-"}|${num(
                        item.gst
                    )}`;


                const row =
                    rows.get(key) ||
                    {

                        hsn:
                            text(
                                item.hsn
                            ) || "-",

                        taxable: 0,

                        igstRate: 0,
                        igstAmount: 0,

                        cgstRate: 0,
                        cgstAmount: 0,

                        sgstRate: 0,
                        sgstAmount: 0,

                        totalTax: 0
                    };


                const taxable =
                    num(
                        item.taxable
                    );


                const tax =
                    num(
                        item.tax
                    );


                row.taxable +=
                    taxable;


                row.totalTax +=
                    tax;


                if (interstate) {

                    row.igstRate =
                        num(
                            item.gst
                        );


                    row.igstAmount +=
                        tax;

                } else {

                    row.cgstRate =
                        num(
                            item.gst
                        ) / 2;


                    row.sgstRate =
                        num(
                            item.gst
                        ) / 2;


                    row.cgstAmount +=
                        tax / 2;


                    row.sgstAmount +=
                        tax / 2;
                }


                rows.set(
                    key,
                    row
                );
            }
        );


    return [
        ...rows.values()
    ];
}


/* =========================================================
   PRINT QUOTATION
========================================================= */

function printDeliveryChallan(q) {

    if (!q) return;

    const b =
        data
            .businesses()
            .find(
                (x) =>
                    text(x._id) ===
                    text(q.businessId)
            ) || {
                name:
                    q.businessName
            };

    const customer =
        q.customer || {};

    const rows =
        (q.items || [])
            .map(
                (item, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${html(item.description)}</td>
                        <td>${html(item.hsn)}</td>
                        <td class="r">${html(item.qty)}</td>
                        <td>${html(item.unit || "Pcs")}</td>
                    </tr>
                `
            )
            .join("");

    const w =
        window.open(
            "",
            "_blank"
        );

    if (!w) {
        return toast(
            "Allow popups to print delivery challans."
        );
    }

    w.document.write(`
        <!doctype html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Delivery Challan ${html(q.quotationNo)}</title>
            <style>
                * { box-sizing: border-box; }
                body { margin: 24px; color: #111; font-family: Arial, sans-serif; }
                .challan { max-width: 900px; margin: auto; border: 1.5px solid #222; }
                .head, .party, .footer { padding: 16px; border-bottom: 1px solid #333; }
                .head { display: flex; justify-content: space-between; gap: 24px; }
                .head h1, .head h2, h3, p { margin: 0; }
                .head h1 { font-size: 24px; margin-bottom: 7px; }
                .head h2 { font-size: 20px; letter-spacing: 1px; text-align: right; }
                p { margin-top: 5px; line-height: 1.45; }
                .meta { min-width: 220px; text-align: right; }
                .party { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
                .party > div + div { border-left: 1px solid #aaa; padding-left: 18px; }
                h3 { font-size: 13px; margin-bottom: 7px; text-transform: uppercase; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #444; padding: 9px 7px; font-size: 12px; }
                th { background: #f2f2f2; text-align: center; }
                .r { text-align: right; }
                .total { font-weight: 700; background: #fafafa; }
                .footer { border-bottom: 0; }
                .signature { display: flex; justify-content: space-between; padding-top: 55px; }
                @media print {
                    body { margin: 0; }
                    .challan { max-width: none; }
                    @page { size: A4; margin: 10mm; }
                }
            </style>
        </head>
        <body>
            <main class="challan">
                <header class="head">
                    <div>
                        <h1>${html(b.name)}</h1>
                        <p>${html(b.address)}<br>GSTIN: ${html(b.gstin)} | State Code: ${html(b.stateCode)}</p>
                    </div>
                    <div class="meta">
                        <h2>DELIVERY CHALLAN</h2>
                        <p><b>Challan No:</b> DC-${html(q.quotationNo)}<br><b>Date:</b> ${html(q.date)}<br><b>Ref. Quotation:</b> ${html(q.quotationNo)}</p>
                    </div>
                </header>
                <section class="party">
                    <div>
                        <h3>Consignee / Deliver To</h3>
                        <p><b>${html(customer.name)}</b><br>${html(customer.address)}<br>Mobile: ${html(customer.mobile)}<br>GSTIN: ${html(customer.gstin)} | State Code: ${html(customer.stateCode)}</p>
                    </div>
                    <div>
                        <h3>Transport Details</h3>
                        <p>Vehicle No: ${html(q.vehicleNo || "Not specified")}<br>Mode: ${html(q.transportMode || "Road")}<br>Delivery purpose: Against quotation</p>
                    </div>
                </section>
                <table>
                    <thead><tr><th>Sl</th><th>Description of Goods</th><th>HSN / SAC</th><th>Quantity</th><th>Unit</th></tr></thead>
                    <tbody>${rows}</tbody>
                    <tfoot><tr class="total"><td colspan="3" class="r">Total Quantity</td><td class="r">${q.items.reduce((sum, item) => sum + num(item.qty), 0)}</td><td></td></tr></tfoot>
                </table>
                <footer class="footer">
                    <p><b>Declaration:</b> Goods listed above are delivered against the referenced quotation. This document does not record sale value or tax.</p>
                    <div class="signature"><span>Receiver Signature</span><span>Authorised Signatory</span></div>
                </footer>
            </main>
            <script>window.onload = function () { window.print(); };</script>
        </body>
        </html>
    `);

    w.document.close();
}

function printQuotation(q) {

    if (!q) return;


    const b =
        data
            .businesses()
            .find(
                (x) =>
                    text(x._id) ===
                    text(q.businessId)
            ) || {

                name:
                    q.businessName
            };

    const quotationTemplate =
        ["classic", "modern", "compact"].includes(
            text(b.quotationTemplate)
        )
            ? b.quotationTemplate
            : "classic";


    /* =====================================================
       MAIN ITEM ROWS
    ===================================================== */

    const rows =
        q.items
            .map(
                (i, x) => {

                    const c =
                        qMath(i);


                    return `

                        <tr>

                            <td>
                                ${x + 1}
                            </td>

                            <td>
                                ${html(
                                    i.description
                                )}
                            </td>

                            <td>
                                ${html(
                                    i.hsn
                                )}
                            </td>

                            <td class="r">
                                ${i.qty}
                            </td>

                            <td class="r">
                                ${money2(
                                    i.rate
                                )}
                            </td>

                            <td class="r">
                                ${money2(
                                    c.taxable
                                )}
                            </td>

                            <td class="r">
                                ${decimal2(
                                    i.gst
                                )}%
                            </td>

                            <td class="r">
                                ${money2(
                                    c.tax
                                )}
                            </td>

                            <td class="r">
                                ${money2(
                                    c.gross
                                )}
                            </td>

                        </tr>

                    `;
                }
            )
            .join("");


    /* =====================================================
       GST BREAKDOWN
    ===================================================== */

    const gstRows =
        gstBreakdown(
            q,
            b
        );


    const totalTax =
        gstRows.reduce(
            (sum, row) =>
                sum +
                row.totalTax,
            0
        );

    const modernTaxTotals =
        gstRows.reduce(
            (totals, row) => ({
                igst: totals.igst + row.igstAmount,
                cgst: totals.cgst + row.cgstAmount,
                sgst: totals.sgst + row.sgstAmount
            }),
            {
                igst: 0,
                cgst: 0,
                sgst: 0
            }
        );


    const gstTable =
        gstRows
            .map(
                (row) => `

                    <tr>

                        <td>
                            ${html(
                                row.hsn
                            )}
                        </td>


                        <td class="r">
                            ${money2(
                                row.taxable
                            )}
                        </td>


                        <td class="r">

                            ${
                                row.igstRate
                                    ? `${decimal2(
                                        row.igstRate
                                    )}%`
                                    : "-"
                            }

                        </td>


                        <td class="r">

                            ${money2(
                                row.igstAmount
                            )}

                        </td>


                        <td class="r">

                            ${
                                row.cgstRate
                                    ? `${decimal2(
                                        row.cgstRate
                                    )}%`
                                    : "-"
                            }

                        </td>


                        <td class="r">

                            ${money2(
                                row.cgstAmount
                            )}

                        </td>


                        <td class="r">

                            ${
                                row.sgstRate
                                    ? `${decimal2(
                                        row.sgstRate
                                    )}%`
                                    : "-"
                            }

                        </td>


                        <td class="r">

                            ${money2(
                                row.sgstAmount
                            )}

                        </td>


                        <td class="r">

                            ${money2(
                                row.totalTax
                            )}

                        </td>

                    </tr>

                `
            )
            .join("");


    /* =====================================================
       BANK DETAILS
    ===================================================== */

    const bank = [

        b.bankName,

        b.accountName &&
            `Account Name: ${b.accountName}`,

        b.accountNumber &&
            `A/c No.: ${b.accountNumber}`,

        b.ifsc &&
            `IFSC: ${b.ifsc}`

    ]

        .filter(Boolean)

        .map(html)

        .join("<br>");

    const modernRows =
        q.items
            .map(
                (i, x) => {
                    const c = qMath(i);
                    const itemDiscount = num(i.discount);
                    const discountLabel = itemDiscount
                        ? `${money2(itemDiscount)}${i.discountRate ? ` (${decimal2(i.discountRate)}%)` : ""}`
                        : "-";

                    return `
                        <tr>
                            <td>${x + 1}</td>
                            <td><b>${html(i.description)}</b></td>
                            <td>${html(i.hsn)}</td>
                            <td class="r">${c.qty}</td>
                            <td class="c">${html(i.unit || "-")}</td>
                            <td class="r">${money2(i.rate)}</td>
                            <td class="r">${discountLabel}</td>
                            <td class="r">${money2(c.tax)}<small> (${decimal2(i.gst)}%)</small></td>
                            <td class="r">${money2(c.gross - itemDiscount)}</td>
                        </tr>
                    `;
                }
            )
            .join("");

    const modernMarkup = `
        <main class="modern-sheet">
            <header class="modern-brand">
                <div class="modern-title">QUOTATION</div>
                <div class="modern-business">
                    <h1>${html(b.name)}</h1>
                    <p>${html(b.address)}</p>
                    <p>Phone: ${html(b.mobile)}${b.email ? ` | Email: ${html(b.email)}` : ""}</p>
                    <p>GSTIN: ${html(b.gstin)} | State Code: ${html(b.stateCode)}</p>
                </div>
            </header>

            <section class="modern-meta">
                <div><b>Quotation No.</b><strong>${html(q.quotationNo)}</strong></div>
                <div><b>Date</b><strong>${html(q.date)}</strong></div>
                <div><b>Valid Until</b><strong>${html(q.validUntil)}</strong></div>
                <div class="modern-customer"><b>Quotation To</b><strong>${html(q.customer?.name)}</strong><span>${html(q.customer?.address)}${q.customer?.mobile ? ` | ${html(q.customer.mobile)}` : ""}</span></div>
            </section>

            <table class="modern-items">
                <thead>
                    <tr><th>#</th><th>Item name</th><th>Item Code<br>/ SAC</th><th>Quantity</th><th>Unit</th><th>Price / Unit</th><th>Discount</th><th>GST</th><th>Amount</th></tr>
                </thead>
                <tbody>${modernRows}</tbody>
                <tfoot><tr><th colspan="3">Total</th><th class="r">${q.items.reduce((sum, item) => sum + qMath(item).qty, 0)}</th><th></th><th></th><th></th><th class="r">${money2(totalTax)}</th><th class="r">${money2(q.subtotal)}</th></tr></tfoot>
            </table>

            <section class="modern-bottom">
                <div class="modern-notes">
                    <h3>Quotation Amount In Words</h3>
                    <p>${html(words(q.total))}</p>
                    <h3>Terms And Conditions</h3>
                    <p>${html(q.terms || DEFAULT_QUOTATION_TERMS)}</p>
                    <p>${html(q.notes || DEFAULT_QUOTATION_NOTES)}</p>
                    <div class="modern-signature">For: ${html(b.name)}<br><br><b>Authorized Signatory</b></div>
                </div>
                <div class="modern-summary">
                    <div><span>Total Taxable Amount</span><b>${money2(q.taxableAmount)}</b></div>
                    <div><span>Discount</span><b>${money2(-num(q.discount))}</b></div>
                    <div><span>IGST</span><b>${money2(modernTaxTotals.igst)}</b></div>
                    <div><span>CGST</span><b>${money2(modernTaxTotals.cgst)}</b></div>
                    <div><span>SGST</span><b>${money2(modernTaxTotals.sgst)}</b></div>
                    <div><span>Round off</span><b>${money2(q.roundOff)}</b></div>
                    <div class="modern-total"><span>Total</span><b>${money2(q.total)}</b></div>
                </div>
            </section>
            <footer class="modern-bank"><b>Bank Details:</b> ${bank || "Not provided"}</footer>
        </main>
    `;


    /* =====================================================
       OPEN PRINT WINDOW
    ===================================================== */

    const w =
        window.open(
            "",
            "_blank"
        );


    if (!w) {

        return toast(
            "Allow popups to print quotations."
        );
    }


    w.print =
        () => {};


    w.document.write(`

        <!doctype html>

        <html>

        <head>

            <meta charset="UTF-8">

            <title>
                Quotation
                ${html(
                    q.quotationNo
                )}
            </title>


            <style>

                * {
                    box-sizing: border-box;
                }


                body {

                    font-family:
                        Arial,
                        sans-serif;

                    margin: 24px;

                    background: white;

                    color: #111;
                }


                .s {

                    max-width: 950px;

                    margin: auto;

                    border: 1.5px solid #222;

                    display: flex;

                    flex-direction: column;
                }


                .h,
                .d,
                .f {

                    padding: 16px;

                    border-bottom:
                        1px solid #333;
                }


                .h {

                    display: flex;

                    justify-content:
                        space-between;

                    gap: 20px;
                }


                .h > div:last-child {

                    text-align: right;

                    min-width: 220px;
                }


                h1,
                h2,
                h3,
                p {

                    margin: 0;
                }


                h1 {

                    font-size: 24px;

                    margin-bottom: 6px;
                }


                h2 {

                    font-size: 20px;

                    letter-spacing: 1px;
                }


                h3 {

                    font-size: 14px;

                    margin-bottom: 5px;
                }


                p {

                    margin-top: 5px;

                    line-height: 1.45;
                }


                table {

                    width: 100%;

                    border-collapse:
                        collapse;
                }


                th,
                td {

                    border:
                        1px solid #444;

                    padding:
                        7px 6px;

                    vertical-align:
                        middle;
                }


                th {

                    font-size: 11px;

                    text-align: center;

                    font-weight: 700;

                    background:
                        #f2f4f7;
                }


                td {

                    font-size: 11px;
                }


                .r {

                    text-align: right;
                }


                .c {

                    text-align: center;
                }


                /* ==========================================
                   GST BREAKDOWN
                ========================================== */

                .gst-title {

                    padding:
                        14px 16px 7px;

                    font-size: 15px;

                    order: 3;

                    margin: 0;
                }


                .quote-gst {

                    order: 4;
                }


                .quote-gst thead tr:first-child th {

                    background:
                        #dfe6ee;

                    font-size: 11px;

                    text-align: center;

                    padding: 7px;
                }


                .quote-gst thead tr:nth-child(2) th {

                    background:
                        #f3f5f8;

                    font-size: 10px;

                    padding: 5px;
                }


                .quote-gst td {

                    font-size: 10.5px;
                }


                .quote-gst tfoot td {

                    font-weight: bold;

                    background:
                        #f5f5f5;
                }


                /* ==========================================
                   TOTAL BOX
                ========================================== */

                .tot {

                    margin-left: auto;

                    width: 350px;

                    padding: 14px;

                    order: 2;
                }


                .tot div {

                    display: flex;

                    justify-content:
                        space-between;

                    align-items: center;

                    padding: 6px 8px;

                    border-bottom:
                        1px solid #ddd;

                    font-size: 13px;
                }


                .tot .grand {

                    font-size: 18px;

                    font-weight: bold;

                    border-top:
                        2px solid #222;

                    border-bottom:
                        2px solid #222;

                    margin-top: 3px;

                    padding-top: 9px;

                    padding-bottom: 9px;
                }


                .f {

                    order: 5;

                    border-bottom: none;

                    font-size: 11px;
                }


                .sig {

                    text-align: right;

                    padding-top: 30px;

                    min-height: 80px;
                }


                @media print {

                    body {

                        margin: 0;
                    }


                    .s {

                        max-width: none;

                        border:
                            1.5px solid #222;
                    }


                    @page {

                        size: A4;

                        margin: 10mm;
                    }
                }

            </style>

        </head>


        <body>


            ${quotationTemplate === "modern" ? modernMarkup : ""}

            <main class="s classic-layout quotation-${quotationTemplate}">


                <!-- HEADER -->

                <section class="h">

                    <div>

                        <h1>
                            ${html(
                                b.name
                            )}
                        </h1>


                        <p>

                            ${html(
                                b.address
                            )}

                            <br>

                            GSTIN:
                            ${html(
                                b.gstin
                            )}

                            &nbsp; | &nbsp;

                            State Code:
                            ${html(
                                b.stateCode
                            )}

                        </p>

                    </div>


                    <div>

                        <h2>
                            QUOTATION
                        </h2>


                        <p>

                            <b>No:</b>
                            ${html(
                                q.quotationNo
                            )}

                            <br>

                            <b>Date:</b>
                            ${html(
                                q.date
                            )}

                            <br>

                            <b>Valid Until:</b>
                            ${html(
                                q.validUntil
                            )}

                        </p>

                    </div>

                </section>


                <!-- CUSTOMER -->

                <section class="d">

                    <h3>
                        Quotation To
                    </h3>


                    <p>

                        <b>
                            ${html(
                                q.customer
                                    ?.name
                            )}
                        </b>

                        <br>

                        ${html(
                            q.customer
                                ?.address
                        )}

                        <br>

                        Mobile:
                        ${html(
                            q.customer
                                ?.mobile
                        )}

                        &nbsp; | &nbsp;

                        GSTIN:
                        ${html(
                            q.customer
                                ?.gstin
                        )}

                    </p>

                </section>


                <!-- MAIN ITEM TABLE -->

                <table>

                    <thead>

                        <tr>

                            <th>Sl</th>

                            <th>
                                Description
                            </th>

                            <th>HSN</th>

                            <th>Qty</th>

                            <th>
                                Rate Incl. Tax
                            </th>

                            <th>
                                Taxable Value
                            </th>

                            <th>
                                GST Rate
                            </th>

                            <th>
                                GST Amount
                            </th>

                            <th>
                                Total
                            </th>

                        </tr>

                    </thead>


                    <tbody>

                        ${rows}

                    </tbody>


                    <tfoot>

                        <tr>

                            <td
                                colspan="5"
                                class="r"
                            >

                                <b>
                                    Goods Total
                                </b>

                            </td>


                            <td class="r">

                                <b>
                                    ${money2(
                                        q.taxableAmount
                                    )}
                                </b>

                            </td>


                            <td></td>


                            <td class="r">

                                <b>
                                    ${money2(
                                        q.taxAmount
                                    )}
                                </b>

                            </td>


                            <td class="r">

                                <b>
                                    ${money2(
                                        q.subtotal
                                    )}
                                </b>

                            </td>

                        </tr>

                    </tfoot>

                </table>


                <!-- GST BREAKDOWN -->

                <h3 class="gst-title">
                    GST Breakdown
                </h3>


                <table
                    class="quote-gst"
                >

                    <thead>

                        <tr>

                            <th rowspan="2">
                                HSN
                            </th>

                            <th rowspan="2">
                                Taxable Value
                            </th>

                            <th colspan="2">
                                IGST
                            </th>

                            <th colspan="2">
                                CGST
                            </th>

                            <th colspan="2">
                                SGST
                            </th>

                            <th rowspan="2">
                                Total Tax
                            </th>

                        </tr>


                        <tr>

                            <th>
                                Rate
                            </th>

                            <th>
                                Amount
                            </th>

                            <th>
                                Rate
                            </th>

                            <th>
                                Amount
                            </th>

                            <th>
                                Rate
                            </th>

                            <th>
                                Amount
                            </th>

                        </tr>

                    </thead>


                    <tbody>

                        ${
                            gstTable ||
                            `
                            <tr>

                                <td
                                    colspan="9"
                                    class="c"
                                >
                                    No GST items.
                                </td>

                            </tr>
                            `
                        }

                    </tbody>


                    <tfoot>

                        <tr>

                            <td
                                colspan="8"
                                class="r"
                            >

                                <b>
                                    Total Tax
                                </b>

                            </td>


                            <td
                                class="r"
                            >

                                <b>
                                    ${money2(
                                        totalTax
                                    )}
                                </b>

                            </td>

                        </tr>

                    </tfoot>

                </table>


                <!-- TOTALS -->

                <section class="tot">


                    <div>

                        <span>
                            Subtotal
                        </span>

                        <b>
                            ${money2(
                                q.subtotal
                            )}
                        </b>

                    </div>


                    <div>

                        <span>
                            Discount
                        </span>

                        <b>
                            ${money2(
                                -num(
                                    q.discount
                                )
                            )}
                        </b>

                    </div>


                    <div>

                        <span>
                            Auto Round Off
                        </span>

                        <b>
                            ${money2(
                                q.roundOff
                            )}
                        </b>

                    </div>


                    <div
                        class="grand"
                    >

                        <span>
                            Total
                        </span>

                        <span>
                            ${money2(
                                q.total
                            )}
                        </span>

                    </div>

                </section>


                <!-- FOOTER -->

                <section class="f">


                    <p>

                        <b>
                            Amount in words:
                        </b>

                        ${html(
                            words(
                                q.total
                            )
                        )}

                    </p>


                    <p>

                        <b>
                            Total tax in words:
                        </b>

                        ${html(
                            words(
                                totalTax
                            )
                        )}

                    </p>


                    <p>

                        <b>
                            Bank Details:
                        </b>

                        ${
                            bank ||
                            "Not provided"
                        }

                    </p>


                    <p>

                        <b>
                            Notes:
                        </b>

                        ${html(
                            q.notes ||
                            DEFAULT_QUOTATION_NOTES
                        )}

                    </p>


                    <p>

                        <b>
                            Terms:
                        </b>

                        ${html(
                            q.terms ||
                            DEFAULT_QUOTATION_TERMS
                        )}

                    </p>


                    <div
                        class="sig"
                    >

                        For
                        ${html(
                            b.name
                        )}

                        <br>
                        <br>

                        Authorised Signatory

                    </div>


                </section>


            </main>


            <script>

                window.onload =
                    function() {

                        window.print();

                    };

            <\/script>


        </body>

        </html>

    `);


    w.document.close();


    const professionalStyle =
        w.document.createElement(
            "style"
        );


    professionalStyle.textContent = `

        body,
        table {

            font-family:
                Cambria,
                "Times New Roman",
                serif !important;
        }


        h1,
        h2,
        h3 {

            font-family:
                "Segoe UI",
                Arial,
                sans-serif !important;

            letter-spacing:
                .2px;
        }

        .modern-sheet {
            max-width: 950px;
            margin: auto;
            border: 1px solid #333;
            color: #111;
            background: #fff;
            font-family: Arial, sans-serif;
        }

        .modern-brand {
            display: grid;
            grid-template-columns: 205px 1fr;
            min-height: 150px;
            border-bottom: 2px solid #5145b5;
        }

        .modern-title {
            align-self: start;
            margin: 28px 0 0 22px;
            padding: 12px 18px;
            color: #fff;
            background: #5145b5;
            font-size: 24px;
            font-weight: 700;
        }

        .modern-business {
            padding: 28px 22px 16px;
        }

        .modern-business h1 {
            margin: 0 0 10px;
            color: #5145b5;
            font-size: 25px;
        }

        .modern-business p {
            margin: 4px 0;
            font-size: 12px;
        }

        .modern-meta {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr 2fr;
            border-bottom: 1px solid #333;
        }

        .modern-meta > div {
            display: flex;
            flex-direction: column;
            gap: 7px;
            min-height: 70px;
            padding: 12px;
            border-right: 1px solid #aaa;
            font-size: 12px;
        }

        .modern-meta > div:last-child {
            border-right: 0;
        }

        .modern-meta b,
        .modern-notes h3 {
            color: #5145b5;
        }

        .modern-customer span {
            line-height: 1.3;
        }

        .modern-items {
            width: 100%;
            border-collapse: collapse;
        }

        .modern-items th,
        .modern-items td {
            border: 1px solid #333;
            padding: 8px 6px;
            font-size: 10px;
        }

        .modern-items thead th,
        .modern-items tfoot th {
            color: #fff;
            background: #5145b5;
            text-align: center;
        }

        .modern-items tfoot th {
            text-align: left;
        }

        .modern-items small {
            display: block;
            font-size: 8px;
        }

        .modern-bottom {
            display: grid;
            grid-template-columns: 1fr 330px;
            gap: 20px;
            padding: 14px;
        }

        .modern-notes {
            font-size: 11px;
        }

        .modern-notes h3 {
            margin: 10px 0 5px;
            font-size: 13px;
        }

        .modern-notes p {
            margin: 5px 0;
            line-height: 1.35;
        }

        .modern-summary {
            align-self: start;
            border: 1px solid #333;
        }

        .modern-summary div {
            display: flex;
            justify-content: space-between;
            padding: 7px 9px;
            border-bottom: 1px solid #aaa;
            font-size: 12px;
        }

        .modern-summary .modern-total {
            color: #fff;
            background: #5145b5;
            border-bottom: 0;
            font-size: 16px;
        }

        .modern-signature {
            margin-top: 35px;
            text-align: center;
        }

        .modern-bank {
            padding: 10px 14px;
            border-top: 1px solid #333;
            font-size: 10px;
        }

        .quotation-modern.classic-layout {
            display: none;
        }

        .quotation-modern {
            border: none;
            border-top: 10px solid #1d4ed8;
            box-shadow: 0 0 0 1px #d7dee8;
        }

        .quotation-modern .h {
            display: grid;
            grid-template-columns: 1fr 260px;
            align-items: stretch;
            padding: 0;
            background: #eff6ff;
            border-bottom: 2px solid #1d4ed8;
        }

        .quotation-modern .h > div {
            padding: 24px;
        }

        .quotation-modern .h > div:last-child {
            min-width: 0;
            color: white;
            background: #1d4ed8;
        }

        .quotation-modern .h h1 {
            color: #1d4ed8;
            font-size: 28px;
        }

        .quotation-modern .h h2 {
            color: white;
            font-size: 22px;
        }

        .quotation-modern .d {
            display: grid;
            grid-template-columns: 145px 1fr;
            align-items: center;
            padding: 14px 24px;
            background: #f8fafc;
        }

        .quotation-modern .d h3 {
            margin: 0;
            color: #1d4ed8;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .quotation-modern .d p {
            margin: 0;
        }

        .quotation-modern th {
            color: white;
            background: #1d4ed8;
        }

        .quotation-modern .quote-gst thead tr:first-child th {
            background: #dbeafe;
            color: #1e3a8a;
        }

        .quotation-modern .tot {
            width: 390px;
            margin: 18px 24px 18px auto;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            background: #f8fafc;
        }

        .quotation-modern .tot .grand {
            color: #1d4ed8;
            background: white;
        }

        .quotation-modern .f {
            display: grid;
            grid-template-columns: 1fr 1fr;
            column-gap: 30px;
            padding: 18px 24px;
        }

        .quotation-modern .f .sig {
            grid-column: 2;
            grid-row: 1 / span 5;
            align-self: end;
        }

        .quotation-compact {
            max-width: 820px;
            border: 1px solid #777;
        }

        .quotation-compact .h,
        .quotation-compact .d,
        .quotation-compact .f {
            padding: 10px;
        }

        .quotation-compact h1 {
            font-size: 19px;
        }

        .quotation-compact h2 {
            font-size: 16px;
        }

        .quotation-compact th,
        .quotation-compact td {
            padding: 4px;
            font-size: 10px;
        }

        .quotation-compact .tot {
            width: 280px;
            padding: 8px;
        }

        .quotation-compact .tot div {
            padding: 4px 6px;
            font-size: 11px;
        }

        .quotation-compact .tot .grand {
            font-size: 15px;
        }

        .quotation-compact .sig {
            padding-top: 15px;
            min-height: 55px;
        }

    `;


    w.document.head.append(
        professionalStyle
    );


    setTimeout(
        () => {

            w.print();

        },
        300
    );
}


/* =========================================================
   FORM BINDING
========================================================= */

function bindQuotationForms() {


    $("#businessForm")
        ?.addEventListener(
            "submit",
            withBusySubmit(
                saveBusiness,
                "Saving..."
            )
        );


    $("#businessFormResetBtn")
        ?.addEventListener(
            "click",
            () => {

                editingBusinessId =
                    null;

                $("#businessForm")
                    .reset();

            }
        );


    $("#quotationForm")
        ?.addEventListener(
            "submit",
            withBusySubmit(
                saveQuotation,
                "Saving..."
            )
        );


    $("#quotationAddItemBtn")
        ?.addEventListener(
            "click",
            () => {

                quotationItems.push({

                    description: "",

                    hsn: "",

                    qty: 1,

                    rate: 0,

                    gst: 18

                });


                renderQuotationItems();
            }
        );


    $("#quotationForm")
        ?.discount
        ?.addEventListener(
            "input",
            renderQuotationTotals
        );


    $("#quotationBusiness")
        ?.addEventListener(
            "change",
            () => {

                const b =
                    quotationBusiness();

                const f =
                    $("#quotationForm");


                if (b) {

                    if (
                        !text(
                            f.notes.value
                        )
                    ) {

                        f.notes.value =
                            b.notes ||
                            DEFAULT_QUOTATION_NOTES;
                    }


                    if (
                        !text(
                            f.terms.value
                        )
                    ) {

                        f.terms.value =
                            b.terms ||
                            DEFAULT_QUOTATION_TERMS;
                    }

                }

            }
        );
}