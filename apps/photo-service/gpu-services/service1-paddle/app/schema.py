from pydantic import BaseModel


class ReceiptItem(BaseModel):
    name: str
    quantity: float | None = None
    unit_price: float | None = None
    total_price: float | None = None


class ReceiptData(BaseModel):
    merchant_name: str | None = None
    merchant_address: str | None = None
    date: str | None = None
    time: str | None = None
    receipt_number: str | None = None
    items: list[ReceiptItem] = []
    subtotal: float | None = None
    tax: float | None = None
    total: float | None = None
    currency: str | None = None
    payment_method: str | None = None
