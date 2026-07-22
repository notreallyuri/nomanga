pub mod guest;
pub mod parse;
pub use nomanga_core::{data, extension};
pub mod register;

pub mod prelude {
    pub use crate::guest;
    pub use nomanga_core::data::{chapter::*, homepage::*, manga::*};
    pub use nomanga_core::extension::prelude::*;
}
