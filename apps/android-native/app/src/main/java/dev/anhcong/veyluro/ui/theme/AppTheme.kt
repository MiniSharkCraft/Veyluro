package dev.anhcong.veyluro.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkScheme: ColorScheme = darkColorScheme(
    primary = Color(0xFF65F0DC),
    secondary = Color(0xFF7FA7FF),
    tertiary = Color(0xFFFFD27A),
    background = Color(0xFF061016),
    surface = Color(0xFF0B1821),
    surfaceVariant = Color(0xFF132B38),
    onPrimary = Color(0xFF02221D),
    onSecondary = Color(0xFF071B3F),
    onTertiary = Color(0xFF2C1B00),
    onBackground = Color(0xFFEAF8F6),
    onSurface = Color(0xFFEAF8F6),
    onSurfaceVariant = Color(0xFFA9C8D1),
)

private val LightScheme: ColorScheme = lightColorScheme(
    primary = Color(0xFF006B60),
    secondary = Color(0xFF285CA8),
    tertiary = Color(0xFF8B5D00),
    background = Color(0xFFF0F8FA),
    surface = Color(0xFFFFFFFF),
    surfaceVariant = Color(0xFFDDEEF2),
    onPrimary = Color.White,
    onSecondary = Color.White,
    onTertiary = Color.White,
    onBackground = Color(0xFF151821),
    onSurface = Color(0xFF151821),
    onSurfaceVariant = Color(0xFF46606A),
)

@Composable
fun VeyluroTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkScheme else LightScheme,
        content = content,
    )
}
