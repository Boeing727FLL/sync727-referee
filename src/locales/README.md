# Locale dictionaries

Each locale is a plain synchronous module. This is deliberate: `LanguageProvider`
must render the saved language on its very first render, without an English or
Hebrew flash. Route-level code splitting still keeps the whole language feature
out of routes that do not use it. Missing keys retain the historical fallback:
English first, then the key itself.
