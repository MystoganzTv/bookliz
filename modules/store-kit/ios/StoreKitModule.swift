import ExpoModulesCore
import StoreKit
import UIKit

/// Bookliz Pro on StoreKit 2.
///
/// Only *verified* transactions count: StoreKit checks Apple's signature on
/// device, so there is no receipt server. Entitlements are read fresh from
/// `Transaction.currentEntitlements` (which already drops expired, revoked and
/// refunded ones) every time JS asks, and pushed as `onEntitlementsChanged`
/// whenever `Transaction.updates` delivers something — a renewal, a purchase
/// made on another device, Ask to Buy approved later, a refund.
public class StoreKitModule: Module {
  private var updatesTask: Task<Void, Never>?

  public func definition() -> ModuleDefinition {
    Name("StoreKitBridge")

    Events("onEntitlementsChanged")

    OnCreate {
      self.listenForUpdates()
    }

    OnDestroy {
      self.updatesTask?.cancel()
    }

    AsyncFunction("getProducts") { (ids: [String]) -> [[String: Any]] in
      let products = try await Product.products(for: ids)
      return products.map(StoreKitModule.describe)
    }

    AsyncFunction("purchase") { (id: String) -> [String: Any] in
      guard let product = try await Product.products(for: [id]).first else {
        return ["status": "unavailable"]
      }
      let result = try await product.purchase()
      switch result {
      case .success(let verification):
        guard case .verified(let transaction) = verification else {
          return ["status": "unverified"]
        }
        await transaction.finish()
        return ["status": "success", "entitlements": await StoreKitModule.entitlements()]
      case .pending:
        return ["status": "pending"]
      case .userCancelled:
        return ["status": "cancelled"]
      @unknown default:
        return ["status": "unknown"]
      }
    }

    /// "Restore Purchases": asks the App Store to re-sync this Apple ID's
    /// transactions (may show a sign-in sheet), then reports what is active.
    AsyncFunction("restore") { () -> [[String: Any]] in
      try await AppStore.sync()
      return await StoreKitModule.entitlements()
    }

    AsyncFunction("currentEntitlements") { () -> [[String: Any]] in
      await StoreKitModule.entitlements()
    }

    /// Apple's own manage/cancel sheet, inside the app.
    AsyncFunction("showManageSubscriptions") { () -> Bool in
      guard let scene = await StoreKitModule.activeScene() else { return false }
      try await AppStore.showManageSubscriptions(in: scene)
      return true
    }

    AsyncFunction("canMakePayments") { () -> Bool in
      AppStore.canMakePayments
    }
  }

  private func listenForUpdates() {
    updatesTask?.cancel()
    updatesTask = Task.detached { [weak self] in
      for await update in Transaction.updates {
        if case .verified(let transaction) = update {
          await transaction.finish()
        }
        let current = await StoreKitModule.entitlements()
        self?.sendEvent("onEntitlementsChanged", ["entitlements": current])
      }
    }
  }

  static func entitlements() async -> [[String: Any]] {
    var out: [[String: Any]] = []
    for await result in Transaction.currentEntitlements {
      guard case .verified(let transaction) = result else { continue }
      if transaction.revocationDate != nil { continue }
      var row: [String: Any] = [
        "productId": transaction.productID,
        "originalTransactionId": String(transaction.originalID),
        "purchaseDate": transaction.purchaseDate.timeIntervalSince1970 * 1000,
        "isUpgraded": transaction.isUpgraded,
        "type": StoreKitModule.typeName(transaction.productType),
      ]
      if let expires = transaction.expirationDate {
        row["expirationDate"] = expires.timeIntervalSince1970 * 1000
      }
      out.append(row)
    }
    return out
  }

  static func describe(_ product: Product) -> [String: Any] {
    var row: [String: Any] = [
      "id": product.id,
      "displayName": product.displayName,
      "description": product.description,
      "displayPrice": product.displayPrice,
      "price": NSDecimalNumber(decimal: product.price).doubleValue,
      "currencyCode": product.priceFormatStyle.currencyCode,
      "type": typeName(product.type),
    ]
    if let subscription = product.subscription {
      row["period"] = [
        "unit": unitName(subscription.subscriptionPeriod.unit),
        "value": subscription.subscriptionPeriod.value,
      ]
      if let intro = subscription.introductoryOffer {
        row["introOffer"] = [
          "displayPrice": intro.displayPrice,
          "paymentMode": paymentModeName(intro.paymentMode),
          "periodUnit": unitName(intro.period.unit),
          "periodValue": intro.period.value,
          "periodCount": intro.periodCount,
        ]
      }
    }
    return row
  }

  static func typeName(_ type: Product.ProductType) -> String {
    switch type {
    case .autoRenewable: return "autoRenewable"
    case .nonConsumable: return "nonConsumable"
    case .consumable: return "consumable"
    case .nonRenewable: return "nonRenewable"
    default: return "unknown"
    }
  }

  static func unitName(_ unit: Product.SubscriptionPeriod.Unit) -> String {
    switch unit {
    case .day: return "day"
    case .week: return "week"
    case .month: return "month"
    case .year: return "year"
    @unknown default: return "unknown"
    }
  }

  static func paymentModeName(_ mode: Product.SubscriptionOffer.PaymentMode) -> String {
    switch mode {
    case .freeTrial: return "freeTrial"
    case .payAsYouGo: return "payAsYouGo"
    case .payUpFront: return "payUpFront"
    default: return "unknown"
    }
  }

  @MainActor
  static func activeScene() -> UIWindowScene? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }
      ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
  }
}
