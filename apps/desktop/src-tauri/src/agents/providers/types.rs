#[derive(Clone, Copy, Debug)]
pub struct CliAuthCommands {
    pub login_args: &'static [&'static str],
    pub status_args: &'static [&'static str],
}

#[derive(Clone, Copy, Debug)]
pub enum AuthStrategy {
    CliAuth(CliAuthCommands),
    AcpAuth,
}

#[derive(Clone, Copy, Debug)]
pub struct ProviderConfig {
    pub id: &'static str,
    pub aliases: &'static [&'static str],
    pub binary_candidates: &'static [&'static str],
    pub auth: AuthStrategy,
}
