#[macro_export]
macro_rules! register_sources {
    (
        extension: $ext:expr,
        sources: [$($source:expr),+ $(,)?] $(,)?
    ) => {
        #[::extism_pdk::plugin_fn]
        pub fn get_extension(
            _: (),
        ) -> ::extism_pdk::FnResult<
            ::extism_pdk::Json<$crate::extension::prelude::ExtensionInfo>,
        > {
            Ok(::extism_pdk::Json($ext))
        }

        fn __registered_sources()
            -> ::std::vec::Vec<::std::boxed::Box<dyn $crate::extension::prelude::Source>>
        {
            ::std::vec![$(::std::boxed::Box::new($source)),+]
        }

        fn __find_source(
            id: &str,
        ) -> ::extism_pdk::FnResult<::std::boxed::Box<dyn $crate::extension::prelude::Source>>
        {
            for source in __registered_sources() {
                if source.info().id == id {
                    return Ok(source);
                }
            }
            Err(::extism_pdk::Error::msg(::std::format!("unknown source id: {id}")).into())
        }

        #[::extism_pdk::plugin_fn]
        pub fn get_sources(
            _: (),
        ) -> ::extism_pdk::FnResult<
            ::extism_pdk::Json<::std::vec::Vec<$crate::extension::prelude::SourceInfo>>,
        > {
            Ok(::extism_pdk::Json(
                __registered_sources().iter().map(|s| s.info()).collect(),
            ))
        }

        #[::extism_pdk::plugin_fn]
        pub fn get_filters(
            input: ::extism_pdk::Json<$crate::extension::prelude::Sourced<()>>,
        ) -> ::extism_pdk::FnResult<
            ::extism_pdk::Json<::std::vec::Vec<$crate::extension::prelude::Filter>>,
        > {
            Ok(::extism_pdk::Json(
                __find_source(&input.0.source_id)?.filters(),
            ))
        }

        #[::extism_pdk::plugin_fn]
        pub fn get_settings(
            input: ::extism_pdk::Json<$crate::extension::prelude::Sourced<()>>,
        ) -> ::extism_pdk::FnResult<
            ::extism_pdk::Json<::std::vec::Vec<$crate::extension::config::Setting>>,
        > {
            Ok(::extism_pdk::Json(
                __find_source(&input.0.source_id)?.settings(),
            ))
        }

        #[::extism_pdk::plugin_fn]
        pub fn get_homepage(
            input: ::extism_pdk::Json<$crate::extension::prelude::Sourced<()>>,
        ) -> ::extism_pdk::FnResult<
            ::extism_pdk::Json<
                $crate::extension::prelude::SourceResult<$crate::data::homepage::Homepage>,
            >,
        > {
            Ok(::extism_pdk::Json(
                __find_source(&input.0.source_id)?.homepage(),
            ))
        }

        #[::extism_pdk::plugin_fn]
        pub fn search(
            input: ::extism_pdk::Json<
                $crate::extension::prelude::Sourced<$crate::extension::prelude::SearchQuery>,
            >,
        ) -> ::extism_pdk::FnResult<
            ::extism_pdk::Json<
                $crate::extension::prelude::SourceResult<$crate::extension::prelude::MangaPage>,
            >,
        > {
            let sourced = input.0;
            Ok(::extism_pdk::Json(
                __find_source(&sourced.source_id)?.search(sourced.payload),
            ))
        }

        #[::extism_pdk::plugin_fn]
        pub fn get_section(
            input: ::extism_pdk::Json<
                $crate::extension::prelude::Sourced<$crate::extension::prelude::SectionRef>,
            >,
        ) -> ::extism_pdk::FnResult<
            ::extism_pdk::Json<
                $crate::extension::prelude::SourceResult<$crate::extension::prelude::MangaPage>,
            >,
        > {
            let sourced = input.0;
            Ok(::extism_pdk::Json(
                __find_source(&sourced.source_id)?.section(sourced.payload),
            ))
        }

        #[::extism_pdk::plugin_fn]
        pub fn get_manga(
            input: ::extism_pdk::Json<
                $crate::extension::prelude::Sourced<$crate::extension::prelude::MangaRef>,
            >,
        ) -> ::extism_pdk::FnResult<
            ::extism_pdk::Json<$crate::extension::prelude::SourceResult<$crate::data::manga::Manga>>,
        > {
            let sourced = input.0;
            Ok(::extism_pdk::Json(
                __find_source(&sourced.source_id)?.manga(sourced.payload),
            ))
        }

        #[::extism_pdk::plugin_fn]
        pub fn get_chapters(
            input: ::extism_pdk::Json<
                $crate::extension::prelude::Sourced<$crate::extension::prelude::MangaRef>,
            >,
        ) -> ::extism_pdk::FnResult<
            ::extism_pdk::Json<
                $crate::extension::prelude::SourceResult<
                    ::std::vec::Vec<$crate::data::chapter::Chapter>,
                >,
            >,
        > {
            let sourced = input.0;
            Ok(::extism_pdk::Json(
                __find_source(&sourced.source_id)?.chapters(sourced.payload),
            ))
        }

        #[::extism_pdk::plugin_fn]
        pub fn get_pages(
            input: ::extism_pdk::Json<
                $crate::extension::prelude::Sourced<$crate::extension::prelude::ChapterRef>,
            >,
        ) -> ::extism_pdk::FnResult<
            ::extism_pdk::Json<
                $crate::extension::prelude::SourceResult<
                    ::std::vec::Vec<$crate::data::chapter::Page>,
                >,
            >,
        > {
            let sourced = input.0;
            Ok(::extism_pdk::Json(
                __find_source(&sourced.source_id)?.pages(sourced.payload),
            ))
        }
    };
}
