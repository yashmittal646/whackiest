// Empty stand-in: MediaPipe's usage logging must never leave the phone.
package com.google.android.datatransport.runtime;

import android.content.Context;
import com.google.android.datatransport.Encoding;
import com.google.android.datatransport.Transformer;
import com.google.android.datatransport.Transport;
import com.google.android.datatransport.TransportFactory;

public class TransportRuntime {
  public static void initialize(Context context) {}
  public static TransportRuntime getInstance() { return new TransportRuntime(); }
  public TransportFactory newFactory(Destination destination) {
    return new TransportFactory() {
      @Override public <T> Transport<T> getTransport(String name, Class<T> type, Encoding encoding, Transformer<T, byte[]> transformer) { return event -> {}; }
    };
  }
}
