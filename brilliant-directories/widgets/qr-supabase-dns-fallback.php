<?php
/* WW_QR_SUPABASE_DNS_FALLBACK_START
 * Source snippet mirrored into BD widgets, which cannot include local files.
 * Retry only pre-connect DNS failure for this one TLS-verified Supabase origin.
 */
if (!function_exists('ww_qr_supabase_curl_exec')) {
    function ww_qr_supabase_dns_name($name) {
        if (!is_string($name) || strlen($name) > 254) return '';
        $name = strtolower(substr($name, -1) === '.' ? substr($name, 0, -1) : $name);
        return preg_match('/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z][a-z0-9-]{0,62}$/D', $name) ? $name : '';
    }

    function ww_qr_supabase_public_ipv4($ip) {
        if (!is_string($ip) || filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 | FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) return false;
        $parts = array_map('intval', explode('.', $ip));
        // Include special-use ranges not consistently excluded by PHP 7.2.
        if ($parts[0] === 0 || $parts[0] === 10 || $parts[0] === 127 || $parts[0] >= 224
            || ($parts[0] === 100 && $parts[1] >= 64 && $parts[1] <= 127)
            || ($parts[0] === 169 && $parts[1] === 254)
            || ($parts[0] === 172 && $parts[1] >= 16 && $parts[1] <= 31)
            || ($parts[0] === 192 && (($parts[1] === 0 && in_array($parts[2], array(0, 2), true)) || ($parts[1] === 88 && $parts[2] === 99) || $parts[1] === 168))
            || ($parts[0] === 198 && ($parts[1] === 18 || $parts[1] === 19 || ($parts[1] === 51 && $parts[2] === 100)))
            || ($parts[0] === 203 && $parts[1] === 0 && $parts[2] === 113)) return false;
        return true;
    }

    function ww_qr_supabase_dns_answer_ip($body) {
        $host = 'pszcjoyabwvzsxxjtkhs.supabase.co';
        if (!is_string($body) || strlen($body) > 16384) return '';
        $reply = json_decode($body, true, 16);
        if (!is_array($reply) || !isset($reply['Status']) || $reply['Status'] !== 0
            || !isset($reply['TC']) || $reply['TC'] !== false
            || !isset($reply['Question']) || !is_array($reply['Question']) || count($reply['Question']) !== 1
            || !isset($reply['Question'][0]['name'], $reply['Question'][0]['type'])
            || ww_qr_supabase_dns_name($reply['Question'][0]['name']) !== $host || $reply['Question'][0]['type'] !== 1
            || !isset($reply['Answer']) || !is_array($reply['Answer']) || count($reply['Answer']) > 32) return '';
        $aliases = array(); $addresses = array();
        foreach ($reply['Answer'] as $answer) {
            if (!is_array($answer) || !isset($answer['name'], $answer['type'], $answer['data']) || !is_int($answer['type'])) return '';
            $name = ww_qr_supabase_dns_name($answer['name']);
            if ($name === '') return '';
            if ($answer['type'] === 5) {
                $target = ww_qr_supabase_dns_name($answer['data']);
                if ($target === '' || (isset($aliases[$name]) && $aliases[$name] !== $target)) return '';
                $aliases[$name] = $target;
            } elseif ($answer['type'] === 1) {
                if (!ww_qr_supabase_public_ipv4($answer['data'])) return '';
                $addresses[$name][] = $answer['data'];
            }
        }
        $name = $host; $seen = array();
        for ($depth = 0; $depth < 8; $depth++) {
            if (isset($seen[$name])) return '';
            $seen[$name] = true;
            // A CNAME owner cannot also claim an A address.
            if (isset($aliases[$name])) {
                if (isset($addresses[$name])) return '';
                $name = $aliases[$name];
            } else {
                return isset($addresses[$name][0]) ? $addresses[$name][0] : '';
            }
        }
        return '';
    }

    function ww_qr_supabase_curl_exec($handle, $url) {
        $result = curl_exec($handle);
        if ($result !== false || curl_errno($handle) !== 6) return $result;
        $host = 'pszcjoyabwvzsxxjtkhs.supabase.co';
        if (!is_string($url)) return $result;
        for ($i = 0; $i < strlen($url); $i++) {
            $byte = ord($url[$i]);
            if ($byte <= 32 || $byte === 92 || $byte === 127) return $result;
        }
        $parts = parse_url($url);
        if (!is_array($parts) || !isset($parts['scheme'], $parts['host']) || $parts['scheme'] !== 'https'
            || $parts['host'] !== $host || (isset($parts['port']) && $parts['port'] !== 443)
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment'])
            || curl_getinfo($handle, CURLINFO_EFFECTIVE_URL) !== $url) return $result;
        $resolver = curl_init('https://1.1.1.1/dns-query?name=' . $host . '&type=A');
        if (!$resolver) return $result;
        $body = ''; $overflow = false;
        $configured = curl_setopt_array($resolver, array(
            CURLOPT_HTTPGET => true,
            CURLOPT_HTTPHEADER => array('Accept: application/dns-json'),
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 5,
            CURLOPT_WRITEFUNCTION => function ($unused, $chunk) use (&$body, &$overflow) {
                if (strlen($body) + strlen($chunk) > 16384) { $overflow = true; return 0; }
                $body .= $chunk;
                return strlen($chunk);
            }
        ));
        $resolved = $configured ? curl_exec($resolver) : false;
        $resolverOk = $resolved !== false && !$overflow && curl_errno($resolver) === 0 && curl_getinfo($resolver, CURLINFO_HTTP_CODE) === 200;
        curl_close($resolver);
        $ip = $resolverOk ? ww_qr_supabase_dns_answer_ip($body) : '';
        if ($ip === '' || !curl_setopt_array($handle, array(
            CURLOPT_RESOLVE => array($host . ':443:' . $ip),
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2
        ))) return $result;
        // Same URL, payload and authorization; certificate/SNI remain the hostname.
        return curl_exec($handle);
    }
}
/* WW_QR_SUPABASE_DNS_FALLBACK_END */
