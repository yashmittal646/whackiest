// Empty stand-in: MediaPipe's usage logging must never leave the phone.
package com.google.android.datatransport;

public interface TransportFactory { <T> Transport<T> getTransport(String name, Class<T> type, Encoding encoding, Transformer<T, byte[]> transformer); }
