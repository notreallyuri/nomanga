use nomanga_sdk::extension::info::ExtensionInfo;
use nomanga_sdk::extension::prelude::ABI_VERSION;

mod sources;

nomanga_sdk::register_sources! {
    extension: ExtensionInfo {
        id: "dev.yuri.mainpack".into(),
        name: "Yuri's Sources".into(),
        version: env!("CARGO_PKG_VERSION").into(),
        abi_version: ABI_VERSION,
        author: "Yuri".into(),
        website: None,
    },
    sources: [sources::weebcentral::WeebCentralSource],
}
